/**
 * Execution state file reader/writer.
 *
 * Maintains `.context-index/.execution-state.json` — a live snapshot of
 * current work in progress as a single JSON document. Reads/writes via
 * an atomic temp-then-rename, mirroring `lib/build-state.mjs::atomicWriteJson`.
 *
 * Storage is **shared across git worktrees** (issue-607). The caller-supplied
 * `projectRoot` is validated as before, then mapped to a storage root through
 * the same `resolveStorageRoot()` helper the issue board and the milestone
 * registry already use, so a linked worktree and the main checkout observe one
 * execution state instead of two. `tasks.db_path` is the unified knob for all
 * three artifacts.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/execution-state-migration.spec.md
 *
 * @module lib/execution-state
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { resolveStorageRoot } from "./issues/resolve-root.mjs";
import { loadManifest } from "./manifest.mjs";

const VALID_STATUSES = new Set(["idle", "active", "blocked", "standalone"]);

const STATE_FILE_REL = ".context-index/.execution-state.json";
const STATE_FILE_BASENAME = ".execution-state.json";
const CONTEXT_INDEX_DIR = ".context-index";
const MANIFEST_REL = ".context-index/manifest.yaml";

// Read-size cap per spec AC: oversized files yield null and emit a one-time
// `STATE_FILE_TOO_LARGE` warning on stderr (discarded by shell callers).
const MAX_STATE_FILE_BYTES = 256 * 1024;

// One-time-warning guard so repeated oversized reads do not spam stderr.
let _emittedTooLargeWarning = false;

// ── Error helper ────────────────────────────────────────────────────────────

function mkErr(code, msg) {
  const err = new Error(msg);
  err.code = code;
  return err;
}

// ── Path-safety primitives ──────────────────────────────────────────────────

/**
 * Validate `projectRoot`:
 *   1. Must be a non-empty string.
 *   2. After `path.resolve()`, must be an absolute path.
 *   3. `<resolved>/.context-index/manifest.yaml` must exist (manifest-presence
 *      containment guard, matching `lib/lifecycle-state.mjs`).
 *
 * @param {string} projectRoot
 * @returns {string} The resolved absolute project root.
 */
function validateProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") {
    throw mkErr("INVALID_PROJECT_ROOT", "projectRoot must be a non-empty string");
  }
  const resolved = resolve(projectRoot);
  if (!isAbsolute(resolved)) {
    // `path.resolve` always returns absolute on a real filesystem, but defend.
    throw mkErr("INVALID_PROJECT_ROOT", `projectRoot must resolve absolute: ${projectRoot}`);
  }
  if (!existsSync(join(resolved, MANIFEST_REL))) {
    throw mkErr(
      "INVALID_PROJECT_ROOT",
      `manifest.yaml missing at ${resolved}/.context-index/`
    );
  }
  return resolved;
}

/**
 * Read the manifest for storage-root resolution. Tolerant by design: a
 * missing or unparseable manifest yields `null`, which `resolveStorageRoot`
 * treats as "no explicit override". Mirrors
 * `lib/milestones.mjs::loadManifestForStorage`.
 *
 * @param {string} resolvedProjectRoot - Already-validated project root.
 * @returns {object|null}
 */
function loadManifestForStorage(resolvedProjectRoot) {
  try {
    return loadManifest(resolvedProjectRoot);
  } catch {
    return null;
  }
}

/**
 * Map a validated project root onto the **shared storage root** (issue-607).
 *
 * Delegates to `lib/issues/resolve-root.mjs::resolveStorageRoot` — the single
 * resolver already used by the issue board and the milestone registry — so all
 * three artifacts follow one precedence order:
 *
 *   1. explicit `tasks.db_path` from the manifest (unified knob),
 *   2. the main repo root via `git rev-parse --git-common-dir` (so a linked
 *      worktree shares the main checkout's execution state),
 *   3. the caller-supplied root (non-git checkouts, or a failed git probe).
 *
 * Positive containment: the resolved root must be an existing directory,
 * matching `lib/milestones.mjs::resolveAndValidateStorageRoot`. This defeats a
 * `tasks.db_path` that points at a regular file or a nonexistent path.
 *
 * @param {string} resolvedProjectRoot - Already-validated project root.
 * @returns {string} Absolute storage root.
 */
function resolveExecutionStorageRoot(resolvedProjectRoot) {
  const manifest = loadManifestForStorage(resolvedProjectRoot);
  const raw = resolveStorageRoot(manifest, resolvedProjectRoot);
  if (!raw || typeof raw !== "string") {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `storage root must resolve to a path (got "${raw}")`
    );
  }
  const storageRoot = resolve(raw);

  // Hot path: same root as the caller's. Already proven to be a directory by
  // `validateProjectRoot` (it contains `.context-index/manifest.yaml`).
  if (storageRoot === resolvedProjectRoot) return resolvedProjectRoot;

  let stat;
  try {
    stat = statSync(storageRoot);
  } catch {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`
    );
  }
  if (!stat.isDirectory()) {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `tasks.db_path must point at an existing directory (got "${storageRoot}")`
    );
  }

  // Canonicalize: `resolveStatePath` compares the realpath of the state file's
  // parent against `<storageRoot>/.context-index`, and that parent may not
  // exist yet (first write into a shared root). `git rev-parse` already hands
  // back a canonical path, but a manifest-supplied `tasks.db_path` need not —
  // e.g. macOS `/var/...` vs `/private/var/...`. Canonicalizing here keeps
  // both sides of the containment check in the same form.
  try {
    return realpathSync.native(storageRoot);
  } catch {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `storage root cannot be canonicalized: ${storageRoot}`
    );
  }
}

/**
 * Resolve and validate the state-file path within `<storageRoot>/.context-index/`.
 *
 * Uses `fs.realpathSync.native()` to defeat symlink-escape attacks (CWE-22 /
 * CWE-59). The state file itself may not yet exist, so the realpath check is
 * applied to its parent directory (`.context-index/`).
 *
 * Returns the resolved (non-realpath) state-file path — the caller writes to
 * this resolved path; realpath-prefix is the containment proof, not the write
 * target.
 *
 * @param {string} resolvedProjectRoot - Already-validated storage root
 *   (`resolveExecutionStorageRoot` output). Containment is anchored here.
 * @returns {string} Absolute path to `.execution-state.json`.
 */
function resolveStatePath(resolvedProjectRoot) {
  const statePath = resolve(resolvedProjectRoot, STATE_FILE_REL);
  const stateParent = dirname(statePath);
  // Parent dir must exist for realpath. The caller may create it after
  // validation (writeExecutionState mkdirSyncs it before the temp write).
  // If it does not yet exist, we cannot symlink-escape via it — but we still
  // need a defensive resolution path. Try realpath; on ENOENT, fall back to
  // the string-resolved path (no symlink to follow yet).
  let realProjectRoot;
  let realStateParent;
  try {
    realProjectRoot = realpathSync.native(resolvedProjectRoot);
  } catch {
    throw mkErr("INVALID_STORAGE_PATH", `projectRoot realpath failed: ${resolvedProjectRoot}`);
  }
  try {
    realStateParent = realpathSync.native(stateParent);
  } catch {
    // `.context-index/` doesn't exist yet on disk — use the string-resolved
    // parent for the prefix check. Since it cannot be a symlink (it doesn't
    // exist), there is no symlink escape to defend against here.
    realStateParent = stateParent;
  }

  const expectedPrefix = realProjectRoot + sep + CONTEXT_INDEX_DIR;
  if (
    realStateParent !== expectedPrefix &&
    !realStateParent.startsWith(expectedPrefix + sep)
  ) {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `state path escapes .context-index/: realStateParent=${realStateParent}, expectedPrefix=${expectedPrefix}`
    );
  }
  // Basename must be exactly `.execution-state.json`.
  if (statePath.slice(-STATE_FILE_BASENAME.length) !== STATE_FILE_BASENAME) {
    throw mkErr(
      "INVALID_STORAGE_PATH",
      `state path basename mismatch: ${statePath}`
    );
  }
  return statePath;
}

/**
 * Validate that a proposed temp-file path stays under the resolved state path.
 * Pattern: `<statePath>.<hex>.tmp`.
 *
 * @param {string} statePath
 * @param {string} tempPath
 */
function validateTempPath(statePath, tempPath) {
  if (!tempPath.startsWith(statePath + ".") || !tempPath.endsWith(".tmp")) {
    throw mkErr("INVALID_STORAGE_PATH", `temp path escapes state path: ${tempPath}`);
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate `state` against the status enum and active-state field requirements.
 * Throws coded errors on failure.
 *
 * @param {object} state
 */
function validateState(state) {
  if (!state || !VALID_STATUSES.has(state.status)) {
    throw mkErr(
      "INVALID_STATUS",
      `Invalid status: ${state?.status}. Must be one of: idle, active, blocked, standalone`
    );
  }
  if (state.status === "active") {
    if (!state.planRef) {
      throw mkErr("MISSING_PLAN_REF", "Active state requires planRef");
    }
    if (state.currentTask == null) {
      throw mkErr("MISSING_CURRENT_TASK", "Active state requires currentTask");
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Write execution state to `.context-index/.execution-state.json` atomically.
 *
 * Writes a JSON document via temp-then-rename, mirroring
 * `lib/build-state.mjs::atomicWriteJson`. On rename failure, best-effort
 * `fs.unlinkSync` cleans up the orphan temp file (cleanup errors swallowed),
 * then the original `fs` error is rethrown.
 *
 * @param {string} projectRoot - Absolute path to the project root. Mapped to
 *   the shared storage root (main repo root across git worktrees, or
 *   `tasks.db_path`) before the file path is computed.
 * @param {object} state - State object with status, planRef, currentTask, etc.
 */
export function writeExecutionState(projectRoot, state) {
  validateState(state);
  const resolvedRoot = validateProjectRoot(projectRoot);
  const statePath = resolveStatePath(resolveExecutionStorageRoot(resolvedRoot));

  // Normalize idle/standalone state: clear all binding fields + progress
  const normalized = { ...state };
  if (state.status === "idle" || state.status === "standalone") {
    normalized.planRef = "";
    normalized.currentTask = "";
    normalized.issueBinding = "";
    normalized.blockers = "";
    normalized.nextAction = "";
    normalized.progress = [];
  }

  // Build the on-disk document. Field order is stable for human-readable diffs.
  const doc = {
    status: normalized.status,
    planRef: normalized.planRef ?? "",
    currentTask: normalized.currentTask ?? "",
    issueBinding: normalized.issueBinding ?? "",
    blockers: typeof normalized.blockers === "string" ? normalized.blockers : "",
    nextAction: typeof normalized.nextAction === "string" ? normalized.nextAction : "",
    progress: Array.isArray(normalized.progress) ? normalized.progress : [],
    updated: new Date().toISOString(),
  };

  const dir = dirname(statePath);
  mkdirSync(dir, { recursive: true });

  const tempPath = statePath + "." + randomBytes(4).toString("hex") + ".tmp";
  validateTempPath(statePath, tempPath);

  writeFileSync(tempPath, JSON.stringify(doc, null, 2) + "\n");
  try {
    renameSync(tempPath, statePath);
  } catch (err) {
    // Best-effort cleanup of temp file. Swallow cleanup errors; rethrow the
    // original error.
    try {
      unlinkSync(tempPath);
    } catch {
      // swallow
    }
    throw err;
  }
}

/**
 * Read execution state from `.context-index/.execution-state.json`.
 *
 * Returns `null` on:
 *   - Missing file
 *   - Malformed / truncated / non-JSON content
 *   - Any `fs` / parse error
 *   - File exceeding the 256 KB size cap (emits one-time `STATE_FILE_TOO_LARGE`
 *     warning on stderr; discarded by shell callers)
 *
 * Throws only on `INVALID_PROJECT_ROOT` / `INVALID_STORAGE_PATH`.
 *
 * @param {string} projectRoot - Absolute path to the project root. Mapped to
 *   the shared storage root (main repo root across git worktrees, or
 *   `tasks.db_path`) before the file path is computed.
 * @returns {object|null}
 */
export function readExecutionState(projectRoot) {
  const resolvedRoot = validateProjectRoot(projectRoot);
  const statePath = resolveStatePath(resolveExecutionStorageRoot(resolvedRoot));

  let stats;
  try {
    stats = statSync(statePath);
  } catch {
    return null; // missing file
  }

  if (stats.size > MAX_STATE_FILE_BYTES) {
    if (!_emittedTooLargeWarning) {
      _emittedTooLargeWarning = true;
      try {
        // eslint-disable-next-line no-console
        console.warn(
          `STATE_FILE_TOO_LARGE: ${statePath} is ${stats.size} bytes (cap: ${MAX_STATE_FILE_BYTES})`
        );
      } catch {
        // swallow
      }
    }
    return null;
  }

  let raw;
  try {
    raw = readFileSync(statePath, "utf-8");
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  // Coerce numeric-string currentTask to Number (round-trip compatibility
  // with consumers that previously got `Number`).
  if (typeof parsed.currentTask === "string" && /^\d+$/.test(parsed.currentTask)) {
    parsed.currentTask = Number(parsed.currentTask);
  }

  // Normalize missing-or-empty fields to "" / [] so consumers see a stable
  // in-memory shape.
  return {
    status: typeof parsed.status === "string" ? parsed.status : "",
    planRef: typeof parsed.planRef === "string" ? parsed.planRef : "",
    currentTask:
      typeof parsed.currentTask === "number" || typeof parsed.currentTask === "string"
        ? parsed.currentTask
        : "",
    issueBinding: typeof parsed.issueBinding === "string" ? parsed.issueBinding : "",
    blockers: typeof parsed.blockers === "string" ? parsed.blockers : "",
    nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction : "",
    updated: typeof parsed.updated === "string" ? parsed.updated : "",
    progress: Array.isArray(parsed.progress) ? parsed.progress : [],
  };
}

/**
 * Clear execution state to idle.
 *
 * @param {string} projectRoot - Absolute path to the project root. Mapped to
 *   the shared storage root (main repo root across git worktrees, or
 *   `tasks.db_path`) before the file path is computed.
 */
export function clearExecutionState(projectRoot) {
  writeExecutionState(projectRoot, { status: "idle" });
}
