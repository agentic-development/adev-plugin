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

const EPIC_HEADER = "| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |";
const EPIC_SEPARATOR = "|----|-------|--------|----------|-----------|---------|---------|";
const ISSUE_HEADER = "| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |";
const ISSUE_SEPARATOR = "|----|-------|--------|----------|------|------|----------|-----------|------|-------|---------|---------|";

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
    created: cells[10],
    updated: cells[11],
  };
}

export class FileAdapter {
  constructor(projectRoot) {
    this.name = "file";
    this.projectRoot = projectRoot;
    this.filePath = join(projectRoot, ".context-index", "tasks", "tasks.md");
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
}

export default FileAdapter;
