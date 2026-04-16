/**
 * File-based issue adapter.
 *
 * Stores epics and issues in a single markdown file at
 * .context-index/tasks/tasks.md with two tables (Epics, Issues).
 *
 * Uses only Node.js built-ins: fs, path, crypto.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  validateIssue,
  validateStatusTransition,
  validateEpic,
  detectCycle,
  checkCloseGuard,
} from "./interface.mjs";
import { parseId, getTierConfig } from "./id-utils.mjs";

const EPIC_HEADER = "| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |";
const EPIC_SEPARATOR = "|----|-------|--------|----------|-----------|---------|---------|";
const ISSUE_HEADER = "| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Next-Action | Created | Updated |";
const ISSUE_SEPARATOR = "|----|-------|--------|----------|------|------|----------|-----------|------|-------|-------------|---------|---------|";

function escapeCell(val) {
  if (val === undefined || val === null) return "";
  return String(val).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function unescapeCell(val) {
  return val.replace(/\\\|/g, "|").trim();
}

function parseRow(line) {
  return line.split("|").slice(1, -1).map(unescapeCell);
}

function serializeEpicRow(epic) {
  return `| ${[
    escapeCell(epic.id),
    escapeCell(epic.title),
    escapeCell(epic.status),
    escapeCell(epic.planRef),
    escapeCell(epic.milestone),
    escapeCell(epic.created),
    escapeCell(epic.updated),
  ].join(" | ")} |`;
}

function serializeIssueRow(issue) {
  return `| ${[
    escapeCell(issue.id),
    escapeCell(issue.title),
    escapeCell(issue.status),
    escapeCell(issue.priority),
    escapeCell(issue.type),
    escapeCell(issue.epicId),
    escapeCell(issue.planRef),
    escapeCell(issue.planTask),
    escapeCell(issue.dependencies.join(",")),
    escapeCell(issue.notes),
    escapeCell(issue.next_action),
    escapeCell(issue.created),
    escapeCell(issue.updated),
  ].join(" | ")} |`;
}

function parseEpicRow(cells) {
  // Support both old 6-column format and new 7-column format with Milestone
  if (cells.length >= 7) {
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      planRef: cells[3] || undefined,
      milestone: cells[4] || undefined,
      created: cells[5],
      updated: cells[6],
    };
  }
  // Backward compat: 6-column format without Milestone
  return {
    id: cells[0],
    title: cells[1],
    status: cells[2],
    planRef: cells[3] || undefined,
    milestone: undefined,
    created: cells[4],
    updated: cells[5],
  };
}

function parseIssueRow(cells) {
  // Support both old 12-column format (no next_action) and new 13-column format
  // Column indices:
  //   0: id, 1: title, 2: status, 3: priority, 4: type, 5: epicId,
  //   6: planRef, 7: planTask, 8: deps, 9: notes,
  //   [10: next_action — only in 13-col],  10/11: created, 11/12: updated
  if (cells.length >= 13) {
    // New 13-column format with next_action
    const rawNextAction = cells[10];
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      priority: parseInt(cells[3], 10),
      type: cells[4],
      epicId: cells[5] || undefined,
      planRef: cells[6] || undefined,
      planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
      dependencies: cells[8] ? cells[8].split(",").filter(Boolean) : [],
      notes: cells[9] || "",
      next_action: rawNextAction || null,
      created: cells[11],
      updated: cells[12],
    };
  }
  // Legacy 12-column format — next_action defaults to null
  return {
    id: cells[0],
    title: cells[1],
    status: cells[2],
    priority: parseInt(cells[3], 10),
    type: cells[4],
    epicId: cells[5] || undefined,
    planRef: cells[6] || undefined,
    planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
    dependencies: cells[8] ? cells[8].split(",").filter(Boolean) : [],
    notes: cells[9] || "",
    next_action: null,
    created: cells[10],
    updated: cells[11],
  };
}

export class FileAdapter {
  /**
   * @param {string} projectRoot
   * @param {object} [opts]
   * @param {Object|null} [opts.tierPrefixes] - Override tier prefix map from manifest
   */
  constructor(projectRoot, opts = {}) {
    this.name = "file";
    this.projectRoot = projectRoot;
    this.filePath = join(projectRoot, ".context-index", "tasks", "tasks.md");
    // Validate and store tier config at construction time (throws INVALID_TIER_CONFIG if bad)
    this.tierConfig = getTierConfig(opts.tierPrefixes || null);
  }

  async init() {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (!existsSync(this.filePath)) {
      this._write([], []);
    }
  }

  _read() {
    if (!existsSync(this.filePath)) {
      return { epics: [], issues: [] };
    }

    const content = readFileSync(this.filePath, "utf8");
    const lines = content.split("\n");

    const epics = [];
    const issues = [];
    let section = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "## Epics") { section = "epics"; continue; }
      if (trimmed === "## Issues") { section = "issues"; continue; }
      if (trimmed.startsWith("|-") || trimmed.startsWith("| ID")) continue;
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      if (section === "epics" && trimmed.startsWith("|")) {
        const cells = parseRow(trimmed);
        if (cells.length >= 6 && cells[0]) {
          epics.push(parseEpicRow(cells));
        }
      }

      if (section === "issues" && trimmed.startsWith("|")) {
        const cells = parseRow(trimmed);
        // Accept 12-column (legacy, no next_action) or 13-column (new, with next_action)
        if (cells.length >= 12 && cells[0]) {
          issues.push(parseIssueRow(cells));
        }
      }
    }

    return { epics, issues };
  }

  _write(epics, issues) {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const epicRows = epics.map(serializeEpicRow).join("\n");
    const issueRows = issues.map(serializeIssueRow).join("\n");

    const content = `# Issue Board

## Epics

${EPIC_HEADER}
${EPIC_SEPARATOR}
${epicRows}

## Issues

${ISSUE_HEADER}
${ISSUE_SEPARATOR}
${issueRows}
`;

    // Write via temp-file-then-rename to prevent corruption
    const tmpPath = this.filePath + "." + randomBytes(4).toString("hex") + ".tmp";
    writeFileSync(tmpPath, content);
    renameSync(tmpPath, this.filePath);
  }

  _nextIssueId(issues) {
    let max = 0;
    for (const issue of issues) {
      const num = parseInt(issue.id.replace("issue-", ""), 10);
      if (num > max) max = num;
    }
    return `issue-${max + 1}`;
  }

  _nextEpicId(epics) {
    let max = 0;
    for (const epic of epics) {
      const num = parseInt(epic.id.replace("epic-", ""), 10);
      if (num > max) max = num;
    }
    return `epic-${max + 1}`;
  }

  async create(issueData) {
    const issue = validateIssue(issueData);
    const { epics, issues } = this._read();
    issue.id = this._nextIssueId(issues);
    issues.push(issue);
    this._write(epics, issues);
    return issue;
  }

  async update(id, changes) {
    const { epics, issues } = this._read();
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    validateStatusTransition(issues[idx].status, changes);

    const updated = { ...issues[idx], ...changes, updated: new Date().toISOString() };
    // Preserve id and created
    updated.id = issues[idx].id;
    updated.created = issues[idx].created;
    issues[idx] = updated;
    this._write(epics, issues);
    return updated;
  }

  async close(id, reason) {
    const { epics, issues } = this._read();
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    checkCloseGuard(id, issues);

    const now = new Date().toISOString();
    const notes = issues[idx].notes
      ? `${issues[idx].notes}; Closed: ${reason}`
      : `Closed: ${reason}`;

    issues[idx] = { ...issues[idx], status: "closed", notes, updated: now };
    this._write(epics, issues);
    return issues[idx];
  }

  async list(filters = {}) {
    const { issues } = this._read();
    let result = issues;

    if (filters.status) result = result.filter((i) => i.status === filters.status);
    if (filters.type) result = result.filter((i) => i.type === filters.type);
    if (filters.epicId) result = result.filter((i) => i.epicId === filters.epicId);
    if (filters.planRef) result = result.filter((i) => i.planRef === filters.planRef);

    // Sort by priority (0 first) then creation date
    result.sort((a, b) => a.priority - b.priority || a.created.localeCompare(b.created));
    return result;
  }

  async get(id) {
    const { issues } = this._read();
    return issues.find((i) => i.id === id) || null;
  }

  async listEpics(filters = {}) {
    const { epics } = this._read();
    let result = epics;

    if (filters.status) result = result.filter((e) => e.status === filters.status);
    if (filters.milestone) result = result.filter((e) => e.milestone === filters.milestone);

    return result;
  }

  async createEpic(epicData) {
    const epic = validateEpic(epicData);
    const { epics, issues } = this._read();
    epic.id = this._nextEpicId(epics);
    epics.push(epic);
    this._write(epics, issues);
    return epic;
  }

  async updateEpic(id, changes) {
    const { epics, issues } = this._read();
    const idx = epics.findIndex((e) => e.id === id);
    if (idx === -1) {
      const err = new Error(`Epic not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    const updated = { ...epics[idx], ...changes, updated: new Date().toISOString() };
    updated.id = epics[idx].id;
    updated.created = epics[idx].created;
    epics[idx] = updated;
    this._write(epics, issues);
    return updated;
  }

  async addDependency(issueId, dependsOnId) {
    const { epics, issues } = this._read();
    const idx = issues.findIndex((i) => i.id === issueId);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${issueId}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    // Build deps map for cycle detection
    const depsMap = {};
    for (const issue of issues) {
      depsMap[issue.id] = issue.dependencies || [];
    }

    detectCycle(issueId, dependsOnId, depsMap);

    if (!issues[idx].dependencies.includes(dependsOnId)) {
      issues[idx].dependencies.push(dependsOnId);
      issues[idx].updated = new Date().toISOString();
    }

    this._write(epics, issues);
  }

  /**
   * Create a tiered work item with a pre-specified dotted ID.
   * Tiered items are stored in the Issues table alongside legacy issues.
   * The caller must supply the full ID (e.g. "e1", "e1.f2", "e1.f2.t3").
   *
   * @param {Object} itemData - Must include id and title; other fields optional
   * @returns {Promise<Object>} The created work item
   */
  async createTiered(itemData) {
    if (!itemData.id) {
      const err = new Error("Tiered item requires a pre-specified id");
      err.code = "MISSING_REQUIRED_FIELD";
      throw err;
    }

    // Warn if the parent doesn't exist in the store
    const parsed = parseId(itemData.id, this.tierConfig);
    if (parsed && !parsed.legacy && parsed.parent_id) {
      const { issues } = this._read();
      const parentExists = issues.some((i) => i.id === parsed.parent_id);
      if (!parentExists) {
        // Warning per spec behavior 16 — log but don't throw
        process.stderr.write(
          `[adev] warning: tiered item "${itemData.id}" has parent_id "${parsed.parent_id}" which does not exist in the store\n`
        );
      }
    }

    const issue = validateIssue({ ...itemData, id: itemData.id });
    const { epics, issues } = this._read();
    issue.id = itemData.id; // keep the supplied tiered ID (validateIssue may blank it)
    issues.push(issue);
    this._write(epics, issues);
    return issue;
  }

  /**
   * Return all work items (legacy + tiered) from the Issues table.
   * Unlike list(), no sorting or filtering is applied.
   *
   * @returns {Promise<Array>}
   */
  async listAll() {
    const { issues } = this._read();
    return issues;
  }

  /**
   * Return all descendants of parentId via prefix match on their IDs.
   * Results are sorted by ID for stable ordering.
   *
   * - For legacy IDs (epic-N, issue-N, bd-XXXXXX): returns empty list
   * - For invalid/unrecognized IDs: returns empty list
   * - For tiered IDs: returns all items whose ID starts with "<parentId>."
   *
   * @param {string} parentId
   * @returns {Promise<Array>}
   */
  async walkTree(parentId) {
    const parsed = parseId(parentId, this.tierConfig);

    // Legacy IDs and unrecognized IDs → empty list
    if (!parsed || parsed.legacy) return [];

    const { issues } = this._read();
    const prefix = `${parentId}.`;
    const descendants = issues.filter((i) => i.id.startsWith(prefix));
    descendants.sort((a, b) => a.id.localeCompare(b.id));
    return descendants;
  }

  /**
   * Close a tiered work item with cascade guard.
   * Throws CASCADE_BLOCKED if any unclosed descendants exist.
   * Also applies the existing dependency guard.
   *
   * @param {string} id - Tiered item ID
   * @param {string} reason - Reason for closing
   * @returns {Promise<Object>}
   */
  async closeTiered(id, reason) {
    const { epics, issues } = this._read();
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    // Cascade guard: check for unclosed children
    const parsed = parseId(id, this.tierConfig);
    if (parsed && !parsed.legacy) {
      const prefix = `${id}.`;
      const unclosedChildren = issues.filter(
        (i) => i.id.startsWith(prefix) && i.status !== "closed"
      );
      if (unclosedChildren.length > 0) {
        const childIds = unclosedChildren.map((c) => c.id).join(", ");
        const err = new Error(
          `Cannot close ${id}: blocked by unclosed children: ${childIds}. Close children first.`
        );
        err.code = "CASCADE_BLOCKED";
        err.blockers = unclosedChildren.map((c) => c.id);
        throw err;
      }
    }

    // Existing dependency guard
    checkCloseGuard(id, issues);

    const now = new Date().toISOString();
    const notes = issues[idx].notes
      ? `${issues[idx].notes}; Closed: ${reason}`
      : `Closed: ${reason}`;

    issues[idx] = { ...issues[idx], status: "closed", notes, updated: now };
    this._write(epics, issues);
    return issues[idx];
  }
}

export default FileAdapter;
