/**
 * Resolve the storage root for issue data.
 *
 * Priority:
 *   1. Explicit `tasks.db_path` from manifest config
 *   2. Git main repo root via `git rev-parse --git-common-dir` (handles worktrees)
 *   3. Fallback to cwd
 *
 * Also owns *shadow-board detection* (see `detectShadowBoard` below): because
 * `.context-index/tasks/tasks.json` is git-tracked, every linked worktree
 * checks out its own frozen copy of the board while this module redirects all
 * adapter access to the main repo working copy. Readers that open the board by
 * path instead of through the adapter API silently observe the stale copy.
 *
 * Uses only Node.js built-ins: child_process, fs, path.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @param {object} [manifest] - Parsed manifest.yaml content
 * @param {string} [cwd] - Current working directory
 * @returns {string} Absolute path to the storage root
 */
export function resolveStorageRoot(manifest, cwd = process.cwd()) {
  const dbPath = manifest?.tasks?.db_path;
  if (dbPath) return dbPath;

  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", cwd, stdio: "pipe" },
    ).trim();
    return dirname(commonDir);
  } catch {
    return cwd;
  }
}

// ---------------------------------------------------------------------------
// Shadow-board detection (issue-615)
// ---------------------------------------------------------------------------

/** Board location relative to a storage root. */
const BOARD_REL_PATH = join(".context-index", "tasks", "tasks.json");

/** Immutable "nothing to report" result — never leaks partial state. */
const NO_SHADOW = Object.freeze({ shadowed: false, divergent: false });

/** One-shot gate: the detection subprocess runs at most once per process. */
let _shadowCheckPerformed = false;

/**
 * Resolve symlinks defensively. macOS temp roots (`/tmp`, `/var/folders`) are
 * symlinks, and `git rev-parse` returns the real form — comparing the two
 * without normalising produces spurious "different root" verdicts.
 *
 * @param {string} p
 * @returns {string}
 */
function safeRealpath(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Highest numeric issue suffix on a board (e.g. `issue-614` -> 614).
 *
 * @param {Array<{ id?: string }>} issues
 * @returns {string|null} The winning id, or null when none parse.
 */
function maxIssueId(issues) {
  let bestId = null;
  let bestNum = -1;
  for (const issue of issues) {
    const id = issue?.id;
    if (typeof id !== "string") continue;
    const m = /(\d+)\s*$/.exec(id);
    if (!m) continue;
    const num = Number(m[1]);
    if (num > bestNum) {
      bestNum = num;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Cheap board summary for the advisory message. Never throws: a board that is
 * missing or unparseable yields nulls rather than failing the whole check.
 *
 * @param {string} boardPath
 * @returns {{ exists: boolean, count: number|null, maxId: string|null }}
 */
function summarizeBoard(boardPath) {
  try {
    const data = JSON.parse(readFileSync(boardPath, "utf8"));
    const issues = Array.isArray(data?.issues) ? data.issues : [];
    return { exists: true, count: issues.length, maxId: maxIssueId(issues) };
  } catch {
    return { exists: existsSync(boardPath), count: null, maxId: null };
  }
}

/**
 * Decide whether two board files differ, without parsing either one unless
 * necessary. Different byte lengths settle it with two `stat` calls; equal
 * lengths fall back to a byte comparison.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function filesDiffer(a, b) {
  if (!existsSync(a) || !existsSync(b)) return true;
  try {
    if (statSync(a).size !== statSync(b).size) return true;
    return !readFileSync(a).equals(readFileSync(b));
  } catch {
    // Unreadable is indistinguishable from divergent for advisory purposes.
    return true;
  }
}

/**
 * Detect a *shadow board*: a `tasks.json` sitting inside the current git
 * worktree at a path that is NOT the resolved storage root.
 *
 * Why this exists: `.context-index/tasks/tasks.json` is git-tracked (57+
 * commits of project history), so `git worktree add` materialises a frozen
 * copy in every linked worktree. `resolveStorageRoot` sends every adapter read
 * and write to the main repo working copy, so the two drift apart the moment
 * the real board is mutated. Anything that opens the board by path — a
 * subagent, a shell script, an editor's project-wide search — then reads stale
 * data with no error at all. This function turns that silent wrong answer into
 * an observable one.
 *
 * Pure and side-effect free (no warning is emitted); safe to call in tests.
 * Never throws — any failure is reported as "not shadowed".
 *
 * @param {object} [manifest] - Parsed manifest.yaml content
 * @param {string} [cwd] - Directory to inspect (default: process.cwd())
 * @returns {{
 *   shadowed: boolean,
 *   divergent: boolean,
 *   localPath?: string,
 *   resolvedPath?: string,
 *   local?: { exists: boolean, count: number|null, maxId: string|null },
 *   resolved?: { exists: boolean, count: number|null, maxId: string|null },
 * }}
 */
export function detectShadowBoard(manifest, cwd = process.cwd()) {
  try {
    const storageRoot = resolveStorageRoot(manifest, cwd);

    // The worktree the caller is actually standing in.
    const worktreeRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd,
      stdio: "pipe",
    }).trim();
    if (!worktreeRoot) return NO_SHADOW;

    // Same root => the adapter and a path-based reader agree. Nothing to do.
    // This is the hot path for the main repo and costs one subprocess.
    if (safeRealpath(worktreeRoot) === safeRealpath(storageRoot)) return NO_SHADOW;

    const localPath = join(worktreeRoot, BOARD_REL_PATH);
    if (!existsSync(localPath)) return NO_SHADOW;

    const resolvedPath = join(storageRoot, BOARD_REL_PATH);
    return {
      shadowed: true,
      divergent: filesDiffer(localPath, resolvedPath),
      localPath,
      resolvedPath,
      local: summarizeBoard(localPath),
      resolved: summarizeBoard(resolvedPath),
    };
  } catch {
    return NO_SHADOW;
  }
}

/**
 * Render the operator-facing advisory for a divergent shadow board.
 *
 * @param {ReturnType<typeof detectShadowBoard>} report
 * @returns {string}
 */
export function formatShadowBoardWarning(report) {
  const describe = (side) => {
    if (!side || !side.exists) return "missing";
    const count = side.count === null ? "unparseable" : `${side.count} issues`;
    return side.maxId ? `${count}, max ${side.maxId}` : count;
  };
  return (
    "[adev] SHADOW_ISSUE_BOARD: this worktree contains a stale, git-tracked " +
    "copy of the issue board that is NOT the board adev reads or writes.\n" +
    `[adev]   worktree copy (STALE, ignore it): ${report.localPath} — ${describe(report.local)}\n` +
    `[adev]   real board (authoritative):       ${report.resolvedPath} — ${describe(report.resolved)}\n` +
    "[adev]   Read the board via `adev issues` / getIssueManager(), never by " +
    "opening the worktree path. Silence with ADEV_SILENCE_SHADOW_BOARD=1.\n"
  );
}

/**
 * Emit the shadow-board advisory at most once per process, and only when the
 * two copies have actually diverged (an identical copy is harmless today, and
 * warning on every worktree invocation would train operators to ignore the
 * message).
 *
 * Detection itself is gated to one run per process: the `git rev-parse` probe
 * must not be paid on every `getIssueManager()` call.
 *
 * @param {object} [manifest] - Parsed manifest.yaml content
 * @param {string} [cwd] - Directory to inspect
 * @returns {ReturnType<typeof detectShadowBoard>|null} The report when the
 *   check ran, or null when it was skipped (already run, or silenced).
 */
export function warnOnShadowBoard(manifest, cwd = process.cwd()) {
  if (_shadowCheckPerformed) return null;
  _shadowCheckPerformed = true;
  if (process.env.ADEV_SILENCE_SHADOW_BOARD === "1") return null;

  const report = detectShadowBoard(manifest, cwd);
  if (report.shadowed && report.divergent) {
    process.stderr.write(formatShadowBoardWarning(report));
  }
  return report;
}

/**
 * Reset the once-per-process warning gate. Test-only seam, mirroring the
 * one-shot advisory state in `lib/issues/registry.mjs`.
 */
export function resetShadowBoardWarningState() {
  _shadowCheckPerformed = false;
}
