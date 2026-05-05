/**
 * Execution state file reader/writer.
 *
 * Maintains `.context-index/.execution-state.md` — a live snapshot of
 * current work in progress with YAML frontmatter and markdown progress body.
 *
 * @module lib/execution-state
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { join, isAbsolute, dirname } from "node:path";
import { randomBytes } from "node:crypto";

const VALID_STATUSES = new Set(["idle", "active", "blocked", "standalone"]);
const STATE_FILE = ".context-index/.execution-state.md";

/**
 * Validate projectRoot and state object. Throws coded errors on failure.
 * @param {string} projectRoot
 * @param {object} state
 */
function validateState(projectRoot, state) {
  if (!isAbsolute(projectRoot)) {
    const err = new Error("projectRoot must be an absolute path");
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
  if (!state || !VALID_STATUSES.has(state.status)) {
    const err = new Error(
      `Invalid status: ${state?.status}. Must be one of: idle, active, blocked`
    );
    err.code = "INVALID_STATUS";
    throw err;
  }
  if (state.status === "active") {
    if (!state.planRef) {
      const err = new Error("Active state requires planRef");
      err.code = "MISSING_PLAN_REF";
      throw err;
    }
    if (state.currentTask == null) {
      const err = new Error("Active state requires currentTask");
      err.code = "MISSING_CURRENT_TASK";
      throw err;
    }
  }
}

/**
 * Validate that projectRoot is an absolute path.
 * @param {string} projectRoot
 */
function validateProjectRoot(projectRoot) {
  if (!isAbsolute(projectRoot)) {
    const err = new Error("projectRoot must be an absolute path");
    err.code = "INVALID_PROJECT_ROOT";
    throw err;
  }
}

/**
 * Sanitize a free-text field for safe YAML frontmatter serialization.
 * Replaces newlines with spaces and strips `---` sequences.
 * @param {string} value
 * @returns {string}
 */
function sanitizeField(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\n/g, " ").replace(/---/g, "").trim();
}

/**
 * Serialize execution state to markdown with YAML frontmatter.
 * @param {object} state - Normalized state object
 * @returns {string}
 */
function serialize(state) {
  const lines = ["---"];
  lines.push(`status: ${state.status}`);
  lines.push(`planRef: ${state.planRef ?? ""}`);
  lines.push(`currentTask: ${state.currentTask ?? ""}`);
  lines.push(`issueBinding: ${state.issueBinding ?? ""}`);
  lines.push(`blockers: ${sanitizeField(state.blockers)}`);
  lines.push(`nextAction: ${sanitizeField(state.nextAction)}`);
  lines.push(`updated: ${new Date().toISOString()}`);
  lines.push("---");

  if (state.progress && state.progress.length > 0) {
    lines.push("");
    lines.push("## Progress");
    lines.push("");
    for (const item of state.progress) {
      const marker = item.done ? "x" : " ";
      lines.push(`- [${marker}] ${sanitizeField(item.task)}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Parse YAML frontmatter and progress body from file content.
 * @param {string} raw
 * @returns {object|null}
 */
function parse(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const metadata = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    metadata[key] = value;
  }

  // Coerce currentTask to number if numeric
  if (metadata.currentTask && /^\d+$/.test(metadata.currentTask)) {
    metadata.currentTask = Number(metadata.currentTask);
  }

  // Parse progress from markdown body
  const progress = [];
  const checklistPattern = /^- \[(x| )\] (.+)$/;
  for (const line of body.split("\n")) {
    const m = line.match(checklistPattern);
    if (m) {
      progress.push({ task: m[2], done: m[1] === "x" });
    }
  }

  return {
    status: metadata.status || "",
    planRef: metadata.planRef || "",
    currentTask: metadata.currentTask || "",
    issueBinding: metadata.issueBinding || "",
    blockers: metadata.blockers || "",
    nextAction: metadata.nextAction || "",
    updated: metadata.updated || "",
    progress,
  };
}

/**
 * Write execution state to `.context-index/.execution-state.md`.
 * Atomic write via temp-file-then-rename.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {object} state - State object with status, planRef, currentTask, etc.
 */
export function writeExecutionState(projectRoot, state) {
  validateState(projectRoot, state);

  // Normalize idle/standalone state: clear all binding fields
  const normalized = { ...state };
  if (state.status === "idle" || state.status === "standalone") {
    normalized.planRef = "";
    normalized.currentTask = "";
    normalized.issueBinding = "";
    normalized.blockers = "";
    normalized.nextAction = "";
    normalized.progress = [];
  }

  const content = serialize(normalized);
  const filePath = join(projectRoot, STATE_FILE);
  const dir = dirname(filePath);

  mkdirSync(dir, { recursive: true });

  const tmpPath = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmpPath, content);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of temp file
    try {
      unlinkSync(tmpPath);
    } catch {
      // swallow cleanup errors
    }
    throw err;
  }
}

/**
 * Read execution state from `.context-index/.execution-state.md`.
 * Returns null if the file does not exist or is malformed. Never throws
 * on read/parse errors (except INVALID_PROJECT_ROOT).
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {object|null}
 */
export function readExecutionState(projectRoot) {
  validateProjectRoot(projectRoot);
  try {
    const filePath = join(projectRoot, STATE_FILE);
    const raw = readFileSync(filePath, "utf-8");
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear execution state to idle.
 *
 * @param {string} projectRoot - Absolute path to the project root
 */
export function clearExecutionState(projectRoot) {
  writeExecutionState(projectRoot, { status: "idle" });
}
