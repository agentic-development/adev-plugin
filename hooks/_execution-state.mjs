#!/usr/bin/env node
/**
 * Internal helper for `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh`.
 *
 * Parses `.context-index/.execution-state.json` and emits structured data on
 * stdout. The helper is a parsing subprocess only — it never owns the hook
 * exit code or the `hookSpecificOutput` envelope (constitution Principle 4).
 *
 * Env vars:
 *   ADEV_CONTEXT_ROOT          - project root containing .context-index/
 *   ADEV_EXECUTION_STATE_MODE  - "read" | "resume-block" (default: resume-block)
 *
 * Modes:
 *   read         - Emits JSON.stringify(state) or "null". Used by
 *                  hooks/lifecycle-gate-bash.sh to check only .status.
 *   resume-block - Emits formatted resume-block markdown for active/blocked
 *                  status; empty stdout for idle/standalone/unknown/null.
 *                  Used by hooks/session-start.sh.
 *
 * Exit codes:
 *   0 - success (any path that did not throw an unhandled error)
 *   1 - HELPER_BOOTSTRAP_ERROR — unhandled internal error (broken import,
 *       crashed process). The shell caller treats non-zero exit as
 *       "no resume / no gating signal" and proceeds.
 *
 * Field-rendering safety (resume-block mode only):
 *   - `\r\n` / `\n` / `\r` in `blockers`, `nextAction`, `currentTask` are
 *     replaced with a single space before interpolation into single-line
 *     markdown slots.
 *   - `blockers` and `nextAction` are truncated to 4 KB Unicode codepoints
 *     with a `…[truncated]` marker.
 *   - `progress[].task` is truncated to 256 codepoints per entry.
 *   - `progress[]` is truncated to 100 entries with a trailing `…[N more]`
 *     line.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 */

import { readExecutionState } from "../lib/execution-state.mjs";

const MODE_READ = "read";
const MODE_RESUME_BLOCK = "resume-block";

const FREE_TEXT_CAP_CODEPOINTS = 4096;
const PROGRESS_TASK_CAP_CODEPOINTS = 256;
const PROGRESS_ENTRY_CAP = 100;

/**
 * Truncate a string to at most `cap` Unicode codepoints. Returns the
 * truncated string with a `…[truncated]` marker appended when truncation
 * occurred, otherwise the input unchanged.
 *
 * @param {string} s
 * @param {number} cap
 * @returns {string}
 */
function truncateCodepoints(s, cap) {
  if (typeof s !== "string" || s.length === 0) return "";
  // Walk codepoints to handle surrogate pairs correctly.
  const points = Array.from(s);
  if (points.length <= cap) return s;
  return points.slice(0, cap).join("") + "…[truncated]";
}

/**
 * Truncate a string to at most `cap` codepoints without a truncation marker
 * (used for `progress[].task`).
 */
function truncateCodepointsBare(s, cap) {
  if (typeof s !== "string" || s.length === 0) return "";
  const points = Array.from(s);
  if (points.length <= cap) return s;
  return points.slice(0, cap).join("");
}

/**
 * Replace any newline sequence (`\r\n`, `\n`, `\r`) with a single space.
 *
 * @param {string} s
 * @returns {string}
 */
function flattenNewlines(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\r\n|\r|\n/g, " ");
}

/**
 * Apply newline-flattening + truncation for single-line free-text slots
 * (`blockers`, `nextAction`).
 */
function renderFreeText(value) {
  return truncateCodepoints(flattenNewlines(value), FREE_TEXT_CAP_CODEPOINTS);
}

/**
 * Apply newline-flattening (no truncation) for `currentTask` slot.
 */
function renderCurrentTask(value) {
  if (value == null || value === "") return "";
  return flattenNewlines(String(value));
}

/**
 * Render the active-status resume block.
 *
 * @param {object} state
 * @returns {string}
 */
function renderActiveBlock(state) {
  const lines = [];
  lines.push("---");
  lines.push("name: session-resume");
  lines.push('description: "Resumption context from previous session. You were actively working on a plan."');
  lines.push("---");
  lines.push("");
  lines.push("# Session Resume");
  lines.push("");
  lines.push(`**Status:** active`);
  lines.push(`**Plan:** ${renderCurrentTask(state.planRef ?? "")}`);
  lines.push(`**Current Task:** ${renderCurrentTask(state.currentTask ?? "")}`);
  lines.push(`**Issue:** ${renderCurrentTask(state.issueBinding ?? "")}`);
  lines.push(`**Next Action:** ${renderFreeText(state.nextAction ?? "")}`);

  // Progress checklist
  if (Array.isArray(state.progress) && state.progress.length > 0) {
    lines.push("");
    lines.push("## Progress");
    lines.push("");
    const capped = state.progress.slice(0, PROGRESS_ENTRY_CAP);
    for (const item of capped) {
      const marker = item && item.done ? "x" : " ";
      const taskText = truncateCodepointsBare(
        flattenNewlines(item && typeof item.task === "string" ? item.task : ""),
        PROGRESS_TASK_CAP_CODEPOINTS
      );
      lines.push(`- [${marker}] ${taskText}`);
    }
    if (state.progress.length > PROGRESS_ENTRY_CAP) {
      const more = state.progress.length - PROGRESS_ENTRY_CAP;
      lines.push(`…[${more} more]`);
    }
  }

  lines.push("");
  lines.push(`Resume from Task ${renderCurrentTask(state.currentTask ?? "")}. Read the plan file for full context.`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Render the blocked-status resume block.
 *
 * @param {object} state
 * @returns {string}
 */
function renderBlockedBlock(state) {
  const lines = [];
  lines.push("---");
  lines.push("name: session-resume");
  lines.push('description: "Resumption context from previous session. Work was blocked."');
  lines.push("---");
  lines.push("");
  lines.push("# Session Resume");
  lines.push("");
  lines.push(`**Status:** blocked`);
  lines.push(`**Blocker:** ${renderFreeText(state.blockers ?? "")}`);
  lines.push(`**Next Action:** ${renderFreeText(state.nextAction ?? "")}`);
  lines.push("");
  lines.push("Address the blocker before continuing implementation.");
  lines.push("");
  return lines.join("\n");
}

/**
 * Resolve the project root from `ADEV_CONTEXT_ROOT`. If unset, empty, or
 * pointing at a non-existent / invalid path, return null — the helper emits
 * "null" or empty depending on mode.
 *
 * @returns {string|null}
 */
function resolveProjectRoot() {
  const ctx = process.env.ADEV_CONTEXT_ROOT;
  if (!ctx || typeof ctx !== "string" || ctx.length === 0) return null;
  return ctx;
}

/**
 * Read state from disk, tolerating any failure (returns null).
 *
 * @returns {object|null}
 */
function safeReadState(projectRoot) {
  if (!projectRoot) return null;
  try {
    return readExecutionState(projectRoot);
  } catch {
    // Path containment or other thrown error — caller should see "null".
    return null;
  }
}

function runReadMode(state) {
  if (state == null) {
    process.stdout.write("null");
    return;
  }
  process.stdout.write(JSON.stringify(state));
}

function runResumeBlockMode(state) {
  if (state == null) {
    // Empty stdout — no resume block.
    return;
  }
  switch (state.status) {
    case "active":
      process.stdout.write(renderActiveBlock(state));
      break;
    case "blocked":
      process.stdout.write(renderBlockedBlock(state));
      break;
    case "idle":
    case "standalone":
    case "":
    default:
      // No resume block for idle / standalone / empty / unknown status.
      break;
  }
}

function main() {
  let mode = process.env.ADEV_EXECUTION_STATE_MODE ?? MODE_RESUME_BLOCK;
  if (mode !== MODE_READ && mode !== MODE_RESUME_BLOCK) {
    // Unknown mode: default to resume-block, emit one-time stderr warning
    // (shell caller discards stderr per CON-4 SEC-4).
    try {
      process.stderr.write(
        `UNKNOWN_HELPER_MODE_DEFAULTED: '${mode}' is not a known mode; defaulting to resume-block\n`
      );
    } catch {
      // swallow
    }
    mode = MODE_RESUME_BLOCK;
  }

  const projectRoot = resolveProjectRoot();
  const state = safeReadState(projectRoot);

  if (mode === MODE_READ) {
    runReadMode(state);
  } else {
    runResumeBlockMode(state);
  }
}

try {
  main();
  process.exit(0);
} catch (err) {
  try {
    process.stderr.write(`HELPER_BOOTSTRAP_ERROR: ${err?.message ?? String(err)}\n`);
  } catch {
    // swallow
  }
  process.exit(1);
}
