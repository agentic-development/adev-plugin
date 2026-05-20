/**
 * Session capture — shared module backing the SessionEnd and PreCompact
 * Claude Code hooks. Provides validators (SEC-2, SEC-3, SEC-10) and
 * the `detectExistingCapture()` helper used by the init-time prompt.
 *
 * Pure ESM, Node.js built-ins only (Principle 1). Named exports.
 *
 * The hook-helper entry point (`runCapture()`) and `emitDiagnostic()` land
 * in later tasks; this file initially only exposes the validators that the
 * hook scripts and the init-prompt verb depend on.
 */

import { realpathSync, existsSync, statSync } from "node:fs";
import { isAbsolute, dirname, join, sep } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// validateSessionId  — SEC-2: Claude session IDs are uuid-like; reject anything
// that could be a path-injection vector.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * @param {unknown} id
 * @returns {boolean}
 */
export function validateSessionId(id) {
  if (typeof id !== "string") return false;
  if (id.length === 0) return false;
  return SESSION_ID_RE.test(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// validateCwd  — SEC-10: cwd must be absolute AND must, after realpath
// resolution, sit inside (or be) a directory whose `.context-index/manifest.yaml`
// exists when walking upward. The walk starts from the *resolved* path; raw
// input never seeds the walk.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {unknown} cwd
 * @returns {boolean}
 */
export function validateCwd(cwd) {
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  if (!isAbsolute(cwd)) return false;

  let resolved;
  try {
    resolved = realpathSync(cwd);
  } catch {
    return false;
  }

  // Walk upward from the realpath-resolved starting point.
  let current = resolved;
  while (true) {
    const manifestPath = join(current, ".context-index", "manifest.yaml");
    if (existsSync(manifestPath)) return true;
    const parent = dirname(current);
    if (parent === current) return false; // hit filesystem root
    current = parent;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// validateTranscriptPath  — SEC-3, SEC-10: transcript_path must end in `.jsonl`
// and, after realpath, be a path-prefix child of the (also-realpath-resolved)
// Claude Code transcripts root `~/.claude/projects/<cwd-encoded>/`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode an absolute cwd to the Claude Code transcripts-root segment.
 * Claude Code joins the absolute path with `/` → `-` substitution.
 * @param {string} cwdReal
 * @returns {string}
 */
function encodeCwd(cwdReal) {
  return cwdReal.replace(/\//g, "-");
}

/**
 * Check that `child` is a path-prefix descendant of `parent`. Both arguments
 * must already be normalised absolute paths (realpath-resolved by the caller).
 *
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isContained(child, parent) {
  if (child === parent) return true;
  const withSep = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(withSep);
}

/**
 * @param {unknown} path
 * @param {unknown} cwd
 * @returns {boolean}
 */
export function validateTranscriptPath(path, cwd) {
  if (typeof path !== "string" || path.length === 0) return false;
  if (!path.endsWith(".jsonl")) return false;
  if (typeof cwd !== "string" || cwd.length === 0) return false;
  if (!isAbsolute(cwd)) return false;

  let cwdReal;
  let pathReal;
  try {
    cwdReal = realpathSync(cwd);
  } catch {
    return false;
  }
  try {
    pathReal = realpathSync(path);
  } catch {
    return false;
  }

  const home = process.env.HOME;
  if (!home) return false;
  const rawRoot = join(home, ".claude", "projects", encodeCwd(cwdReal));
  let rootReal;
  try {
    rootReal = realpathSync(rawRoot);
  } catch {
    return false;
  }

  return isContained(pathReal, rootReal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder exports — populated by later tasks. Declared up front so future
// imports during incremental landing don't break, but no-op behaviour for now.
// ─────────────────────────────────────────────────────────────────────────────

// detectExistingCapture is added by Task 4.
// runCapture is added by Task 5.
// emitDiagnostic / formatDiagnostic is added by Task 14.

// Silence unused-import warnings for helpers not consumed in this file.
void statSync;
