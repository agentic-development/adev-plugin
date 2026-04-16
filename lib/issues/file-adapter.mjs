/**
 * File-based issue adapter.
 *
 * Stores epics and issues in a single markdown file at
 * .context-index/tasks/tasks.md with two tables (Epics, Issues).
 *
 * Uses only Node.js built-ins: fs, path, crypto.
 *
 * ## Unified create() API (issue-78)
 *
 * create({ title, parent_id, type, spec_ref, ... }) infers tier prefix
 * from parent_id depth + 1 in TierConfig. Root items default to "e" prefix.
 * Explicit tier_prefix overrides inference.
 *
 * ## Unified close() API (issue-78)
 *
 * close(id, reason) applies cascade guard for tiered IDs (CASCADE_BLOCKED if
 * unclosed children exist) and dependency guard for all IDs. Legacy flat IDs
 * skip the cascade guard.
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
import { parseId, getTierConfig, nextChildId } from "./id-utils.mjs";

// Default root prefix for new root-level tiered items (overridable via TierConfig order)
const DEFAULT_ROOT_PREFIX = "e";

const EPIC_HEADER = "| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |";
const EPIC_SEPARATOR = "|----|-------|--------|----------|-----------|---------|---------|";
const ISSUE_HEADER = "| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |";
const ISSUE_SEPARATOR = "|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|";

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
    escapeCell(issue.spec_ref),
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
  // Column layouts supported:
  //   12-col (legacy, no next_action, no spec_ref):
  //     0:id, 1:title, 2:status, 3:priority, 4:type, 5:epicId,
  //     6:planRef, 7:planTask, 8:deps, 9:notes, 10:created, 11:updated
  //   13-col (next_action, no spec_ref):
  //     0:id, 1:title, 2:status, 3:priority, 4:type, 5:epicId,
  //     6:planRef, 7:planTask, 8:deps, 9:notes, 10:next_action, 11:created, 12:updated
  //   14-col (spec_ref + next_action — current format):
  //     0:id, 1:title, 2:status, 3:priority, 4:type, 5:epicId,
  //     6:planRef, 7:planTask, 8:spec_ref, 9:deps, 10:notes, 11:next_action, 12:created, 13:updated

  if (cells.length >= 14) {
    // New 14-column format with spec_ref and next_action
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      priority: parseInt(cells[3], 10),
      type: cells[4],
      epicId: cells[5] || undefined,
      planRef: cells[6] || undefined,
      planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
      spec_ref: cells[8] || undefined,
      dependencies: cells[9] ? cells[9].split(",").filter(Boolean) : [],
      notes: cells[10] || "",
      next_action: cells[11] || null,
      created: cells[12],
      updated: cells[13],
    };
  }

  if (cells.length >= 13) {
    // 13-column format with next_action but no spec_ref
    return {
      id: cells[0],
      title: cells[1],
      status: cells[2],
      priority: parseInt(cells[3], 10),
      type: cells[4],
      epicId: cells[5] || undefined,
      planRef: cells[6] || undefined,
      planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
      spec_ref: undefined,
      dependencies: cells[8] ? cells[8].split(",").filter(Boolean) : [],
      notes: cells[9] || "",
      next_action: cells[10] || null,
      created: cells[11],
      updated: cells[12],
    };
  }

  // Legacy 12-column format — next_action and spec_ref default to null/undefined
  return {
    id: cells[0],
    title: cells[1],
    status: cells[2],
    priority: parseInt(cells[3], 10),
    type: cells[4],
    epicId: cells[5] || undefined,
    planRef: cells[6] || undefined,
    planTask: cells[7] ? parseInt(cells[7], 10) : undefined,
    spec_ref: undefined,
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
        // Accept 12-column (legacy), 13-column (next_action), or 14-column (spec_ref + next_action)
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

  /**
   * Get the ordered list of tier prefixes from TierConfig.
   * Returns an array where index 0 = root prefix, index 1 = child prefix, etc.
   * @returns {string[]}
   */
  _tierPrefixOrder() {
    return Object.keys(this.tierConfig);
  }

  /**
   * Unified create(): infers tier from parent_id, or creates root item.
   *
   * Behaviors:
   * - No parent_id → root-level item, uses first prefix in TierConfig ("e" by default)
   * - parent_id supplied → tier prefix inferred as next depth level
   * - Explicit tier_prefix overrides inference; validated against TierConfig
   * - Throws PARENT_NOT_FOUND if parent_id doesn't exist in the store
   * - Throws MAX_DEPTH_EXCEEDED if parent is at max tier depth
   * - Throws INVALID_TIER_PREFIX if explicit tier_prefix not in TierConfig
   * - Throws ID_MISMATCH if explicit id prefix conflicts with parent_id-inferred prefix
   * - Adds spec_ref as a distinct field (not alias for planRef)
   *
   * Legacy path: if no parent_id and no tier_prefix and id is explicitly set
   * (legacy "issue-N" format), falls back to legacy ID assignment.
   *
   * @param {Partial<import('./interface.mjs').Issue>} issueData
   * @returns {Promise<import('./interface.mjs').Issue>}
   */
  async create(issueData) {
    const issue = validateIssue(issueData);
    const { epics, issues } = this._read();

    const hasTierIntent = issueData.parent_id || issueData.tier_prefix;

    if (!hasTierIntent) {
      // Legacy path: assign a flat "issue-N" ID (backward compat)
      issue.id = this._nextIssueId(issues);
      issues.push(issue);
      this._write(epics, issues);
      return issue;
    }

    // --- Tiered path ---
    const prefixOrder = this._tierPrefixOrder();
    const maxDepth = prefixOrder.length;

    let resolvedPrefix;
    let resolvedParentId = issueData.parent_id || null;

    if (resolvedParentId) {
      // Validate parent exists
      const parentItem = issues.find((i) => i.id === resolvedParentId);
      if (!parentItem) {
        const err = new Error(`Parent not found: ${resolvedParentId}`);
        err.code = "PARENT_NOT_FOUND";
        throw err;
      }

      // Parse parent to determine depth
      const parsed = parseId(resolvedParentId, this.tierConfig);
      if (!parsed || parsed.legacy) {
        // Legacy parent — can't infer tier; require explicit tier_prefix
        if (!issueData.tier_prefix) {
          const err = new Error(
            `Cannot infer tier prefix for child of legacy ID "${resolvedParentId}". Provide explicit tier_prefix.`
          );
          err.code = "INVALID_TIER_PREFIX";
          throw err;
        }
        resolvedPrefix = issueData.tier_prefix;
      } else {
        const parentDepth = parsed.depth;

        if (parentDepth >= maxDepth) {
          const err = new Error(
            `Cannot create child of ${resolvedParentId}: parent is already at max tier depth (${parentDepth}) per TierConfig. Extend tasks.tier_prefixes to add deeper tiers.`
          );
          err.code = "MAX_DEPTH_EXCEEDED";
          throw err;
        }

        // Next depth index in prefix order
        resolvedPrefix = issueData.tier_prefix || prefixOrder[parentDepth];
      }
    } else {
      // Root-level tiered item
      resolvedPrefix = issueData.tier_prefix || DEFAULT_ROOT_PREFIX;
    }

    // Validate explicit tier_prefix against TierConfig
    if (issueData.tier_prefix && !this.tierConfig[issueData.tier_prefix]) {
      const err = new Error(
        `tier_prefix "${issueData.tier_prefix}" is not in TierConfig. Valid prefixes: ${Object.keys(this.tierConfig).join(", ")}`
      );
      err.code = "INVALID_TIER_PREFIX";
      throw err;
    }

    // Generate the next child ID
    const newId = nextChildId(resolvedParentId, resolvedPrefix, issues);

    // Validate explicit id if supplied
    if (issueData.id && issueData.id !== newId) {
      // Check if the prefix portion matches what we inferred
      const explicitParsed = parseId(issueData.id, this.tierConfig);
      if (!explicitParsed || explicitParsed.legacy || explicitParsed.prefix !== resolvedPrefix) {
        const err = new Error(
          `ID mismatch: explicit id "${issueData.id}" is inconsistent with inferred prefix "${resolvedPrefix}" for parent_id "${resolvedParentId}"`
        );
        err.code = "ID_MISMATCH";
        throw err;
      }
    }

    issue.id = newId;
    if (resolvedParentId) {
      issue.parent_id = resolvedParentId;
    }

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

  /**
   * Unified close(): applies cascade guard for tiered IDs, dependency guard for all IDs.
   *
   * - For tiered IDs: throws CASCADE_BLOCKED if unclosed descendants exist
   * - For legacy flat IDs: cascade guard NOT applied (only dependency guard)
   *
   * @param {string} id
   * @param {string} reason
   * @returns {Promise<import('./interface.mjs').Issue>}
   */
  async close(id, reason) {
    const { epics, issues } = this._read();
    const idx = issues.findIndex((i) => i.id === id);
    if (idx === -1) {
      const err = new Error(`Issue not found: ${id}`);
      err.code = "NOT_FOUND";
      throw err;
    }

    // Cascade guard: only for tiered (non-legacy) IDs
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

    // Dependency guard (applies to all IDs)
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

  /**
   * Create a legacy epic.
   * @deprecated Use create({ type: "epic", ... }) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   * @param {Partial<import('./interface.mjs').Epic>} epicData
   * @returns {Promise<import('./interface.mjs').Epic>}
   */
  async createEpic(epicData) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("createEpic is deprecated; use create() instead. See task-management charter rev 3.");
    }
    const epic = validateEpic(epicData);
    const { epics, issues } = this._read();
    epic.id = this._nextEpicId(epics);
    epics.push(epic);
    this._write(epics, issues);
    return epic;
  }

  /**
   * Update a legacy epic.
   * @deprecated Use update(id, changes) instead.
   *             Set ADEV_DEPRECATION_WARN=1 to see a warning.
   * @param {string} id
   * @param {Partial<import('./interface.mjs').Epic>} changes
   * @returns {Promise<import('./interface.mjs').Epic>}
   */
  async updateEpic(id, changes) {
    if (process.env.ADEV_DEPRECATION_WARN === "1") {
      console.warn("updateEpic is deprecated; use update() instead. See task-management charter rev 3.");
    }
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
   * @deprecated This is a thin wrapper around create() for back-compat.
   *             Prefer create({ parent_id, ... }) for new code.
   *
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
   * @deprecated This is a thin wrapper around close() for back-compat.
   *             The unified close() now handles cascade guard for all tiered IDs.
   *
   * @param {string} id - Tiered item ID
   * @param {string} reason - Reason for closing
   * @returns {Promise<Object>}
   */
  async closeTiered(id, reason) {
    // Delegate to unified close() — it already handles cascade guard for tiered IDs
    return this.close(id, reason);
  }
}

export default FileAdapter;
