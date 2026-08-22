/**
 * `.context-index/tasks/.board-migrate-state.json` — resumable checkpoint
 * for `adev issues board migrate`. Mirrors `lib/cli/issues-migrate.mjs`'s
 * `.migrate-state.json` precedent (same directory, same atomic temp-rename
 * write, same "best-effort clear tolerating ENOENT" semantics), scaled down
 * to the single-marker shape this spec needs: a "push landed" checkpoint
 * written immediately after the `beads-board` push succeeds and immediately
 * before `.beads/` is removed from `main`'s tree, so a partial failure
 * between those two steps is resumable (Error Cases row 8).
 *
 * Lives in `lib/issues/`, not `lib/cli/`: this is a pure data helper with no
 * `run`/`help` CLI-verb surface, matching `lib/issues/board-worktree.mjs`'s
 * placement — every file directly under `lib/cli/` is a dispatched sub-verb
 * module (enforced by `tests/cli-driver-pattern.test.mjs`'s "every
 * lib/cli/*.mjs exports run and help" check), and this module is consumed
 * by one (`lib/cli/issues-board.mjs`), not one itself.
 *
 * Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
 * Plan-task: 5, 10 (relocated out of lib/cli/ during Task 10's full-suite sweep)
 *
 * Uses only Node.js built-ins.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Relative path (from projectRoot) to the checkpoint file. */
const STATE_REL = join(".context-index", "tasks", ".board-migrate-state.json");

/**
 * Atomic write via temp-rename, mirroring `lib/cli/issues-migrate.mjs`'s
 * `atomicWriteJson`. On a rename failure, the temp file is best-effort
 * cleaned up and the error re-thrown — the checkpoint is never left as a
 * half-written final artifact.
 *
 * @param {string} filePath
 * @param {object} data
 */
function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Write the board-migrate checkpoint. Stamps `written_at` (ISO 8601)
 * alongside the caller-supplied fields.
 *
 * @param {string} projectRoot
 * @param {object} data - e.g. `{ step: "push-landed" }`
 */
export function writeBoardMigrateCheckpoint(projectRoot, data) {
  atomicWriteJson(join(projectRoot, STATE_REL), { ...data, written_at: new Date().toISOString() });
}

/**
 * Read the board-migrate checkpoint.
 *
 * @param {string} projectRoot
 * @returns {object|null} Parsed checkpoint, or null when absent or unparseable.
 */
export function readBoardMigrateCheckpoint(projectRoot) {
  const path = join(projectRoot, STATE_REL);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Remove the board-migrate checkpoint. Best-effort — tolerates ENOENT and
 * any other removal failure (mirrors the precedent's tolerance; checkpoint
 * cleanup must never itself fail a successful migration).
 *
 * @param {string} projectRoot
 */
export function clearBoardMigrateCheckpoint(projectRoot) {
  try {
    unlinkSync(join(projectRoot, STATE_REL));
  } catch {
    /* tolerate ENOENT (and any other removal failure — best-effort cleanup) */
  }
}
