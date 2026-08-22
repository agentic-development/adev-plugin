/**
 * `adev issues board migrate` — one-shot, idempotent, resumable migration of
 * the beads board (`.beads/issues.jsonl`) off `main`'s git history onto a
 * dedicated orphan `beads-board` branch, checked out as a linked worktree at
 * `.beads/` (BEH-7/BEH-8/BEH-9).
 *
 * Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
 * Plan-task: 6, 7
 *
 * Contract (new-pattern CLI helper, mirrors lib/cli/issues-migrate.mjs and
 * the other lib/cli/issues-*.mjs sub-verb modules):
 *   - exports `run({ projectRoot, argv, manifest })` returning a numeric exit code
 *   - exports `help()` printing usage to stdout
 *
 * Uses only Node.js built-ins plus in-repo helpers (no new dependency).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { ensureManagedBlock } from "../gitignore-installer.mjs";
import { provisionBoardWorktree, recoverBeforeAdd, BoardWorktreeError } from "../issues/board-worktree.mjs";
import {
  writeBoardMigrateCheckpoint,
  readBoardMigrateCheckpoint,
  clearBoardMigrateCheckpoint,
} from "../issues/board-migrate-state.mjs";
import { safeRealpath } from "../path-safety.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * Topology detection: is `.beads/` already a linked worktree against
 * `beads-board` ("migrated"), or is `.beads/issues.jsonl` still tracked
 * inside `main`'s tree ("main-tracked"), or is there nothing to migrate at
 * all ("nothing")?
 *
 * Callers MUST consult the board-migrate checkpoint BEFORE calling this —
 * see the comment in `run()` for why: the no-man's-land between main-tree
 * cleanup landing and re-provisioning finishing looks identical to "nothing
 * to migrate" from this function's point of view alone.
 *
 * @param {string} projectRoot
 * @returns {"migrated"|"main-tracked"|"nothing"}
 */
function detectTopology(projectRoot) {
  const boardPath = join(projectRoot, ".beads");
  const isWorktree = (() => {
    try {
      const out = git(["worktree", "list", "--porcelain"], projectRoot);
      const resolvedBoardPath = safeRealpath(boardPath);
      return out
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
        .some((line) => safeRealpath(line.slice("worktree ".length)) === resolvedBoardPath);
    } catch {
      return false;
    }
  })();
  if (isWorktree) return "migrated";

  const trackedInMain = (() => {
    try {
      return git(["ls-tree", "-r", "--name-only", "HEAD", "--", ".beads/issues.jsonl"], projectRoot).length > 0;
    } catch {
      return false;
    }
  })();
  return trackedInMain ? "main-tracked" : "nothing";
}

export function help() {
  console.log("Usage: adev issues board <migrate> [--dry-run]");
}

/**
 * `adev issues board migrate [--dry-run]`.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string[]} opts.argv - argv after `board` (e.g. `["migrate"]` or `["migrate", "--dry-run"]`)
 * @param {object} opts.manifest
 * @returns {Promise<number>} exit code
 */
export async function run({ projectRoot, argv, manifest: _manifest }) {
  const sub = argv?.[0];
  if (sub !== "migrate") {
    help();
    return 1;
  }
  const dryRun = argv.includes("--dry-run");

  // Checkpoint check comes FIRST, before topology detection. Once
  // main-tree-cleanup has committed but re-provisioning hasn't finished yet,
  // .beads/ is neither a registered worktree (isWorktree === false) NOR
  // tracked in main's index anymore (trackedInMain === false) —
  // detectTopology() alone cannot tell that apart from "never migrated" and
  // would wrongly return "nothing", short-circuiting into
  // BOARD_NOTHING_TO_MIGRATE before the checkpoint is ever consulted. The
  // checkpoint is the authoritative signal for "push landed AND main's tree
  // is already clean"; when present, skip topology detection entirely and go
  // straight to recovery + re-provisioning. This also means a *resumed*
  // invocation never re-runs `git rm --cached .beads`, `ensureManagedBlock`,
  // or the cleanup commit — those three calls live exclusively inside the
  // `!checkpoint` branch below, guaranteed already done once a checkpoint
  // exists.
  const checkpoint = readBoardMigrateCheckpoint(projectRoot);
  if (checkpoint) {
    if (dryRun) {
      console.log(
        "Dry run: a resumable migration checkpoint exists — would recover and re-provision .beads/ only (main's tree is already clean).",
      );
      return 0;
    }
    // Corrupt-leftover recovery sequence runs unconditionally before every
    // re-provisioning add attempt, including on this resumed path: (1)
    // filesystem delete of any existing .beads/ (not `git worktree remove`),
    // (2) `git worktree prune`.
    recoverBeforeAdd({ projectRoot });
    try {
      provisionBoardWorktree({ projectRoot });
    } catch (err) {
      if (err instanceof BoardWorktreeError) {
        console.error(`BOARD_MIGRATE_PARTIAL_FAILURE: ${err.message}`);
        return 1;
      }
      throw err;
    }
    clearBoardMigrateCheckpoint(projectRoot);
    console.log("Migrated .beads/ to the beads-board linked-worktree topology (resumed from checkpoint).");
    return 0;
  }

  // No checkpoint: this is either a fresh invocation or a fully-completed
  // prior one. Topology detection is meaningful here because it isn't the
  // no-man's-land the checkpoint branch above exists to handle.
  const topology = detectTopology(projectRoot);

  if (topology === "migrated") {
    console.log("BOARD_ALREADY_MIGRATED: .beads/ is already a linked worktree against beads-board. Nothing to do.");
    return 0;
  }
  if (topology === "nothing") {
    console.error("BOARD_NOTHING_TO_MIGRATE: .beads/issues.jsonl is not tracked on main. Nothing to migrate.");
    return 1;
  }
  if (dryRun) {
    console.log(
      "Dry run: would create beads-board, snapshot .beads/issues.jsonl, remove it from main, update .gitignore, and re-provision .beads/ as a linked worktree.",
    );
    return 0;
  }

  // topology === "main-tracked", no checkpoint: run the full snapshot ->
  // branch -> push -> main-tree-cleanup sequence exactly once. main's tree
  // is left untouched until AFTER the beads-board push has succeeded
  // (Error Cases row 7) — everything up to and including the push happens
  // in a disposable temp worktree, never touching main's index or HEAD.
  const snapshot = readFileSync(join(projectRoot, ".beads", "issues.jsonl"));
  const tmpWorktree = join(projectRoot, ".beads-migrate-tmp");
  try {
    git(["worktree", "add", "--orphan", "-b", "beads-board", ".beads-migrate-tmp"], projectRoot);
    try {
      writeFileSync(join(tmpWorktree, "issues.jsonl"), snapshot);
      git(["add", "issues.jsonl"], tmpWorktree);
      git(["commit", "-m", "chore: snapshot board content from main"], tmpWorktree);
      git(["push", "origin", "beads-board"], tmpWorktree);
    } finally {
      // Best-effort: whether the push succeeded or the block above threw,
      // the temp worktree is disposable scaffolding, never the final
      // artifact.
      try {
        git(["worktree", "remove", "--force", ".beads-migrate-tmp"], projectRoot);
      } catch {
        /* leave for the corrupt-leftover recovery sequence below to clean up */
      }
    }
  } catch (err) {
    // Snapshot/branch/push failed before any durable checkpoint was written
    // — main's tree is guaranteed untouched (Error Cases row 7): none of
    // `git rm --cached`, `ensureManagedBlock`, or the cleanup commit below
    // have run yet, since they all live after this block. Report a clean
    // non-zero exit rather than letting the raw subprocess error escape
    // uncaught out of run().
    console.error(`BOARD_MIGRATE_PUSH_FAILED: ${err.stderr?.toString?.().trim() || err.message}`);
    return 1;
  }

  // Checkpoint written immediately after push succeeds — this is the single
  // durable marker a subsequent invocation reads (via the branch above) to
  // know main-tree cleanup is safe to skip re-running.
  writeBoardMigrateCheckpoint(projectRoot, { step: "push-landed" });

  // main tree cleanup — runs exactly once, immediately after the push
  // succeeded. A subsequent invocation never reaches this code path again:
  // it short-circuits into the checkpoint branch at the top of this
  // function, so `git rm --cached`, `ensureManagedBlock`, and the cleanup
  // commit below are each guaranteed to run at most once per migration.
  git(["rm", "-r", "--cached", ".beads"], projectRoot);
  ensureManagedBlock(projectRoot);
  git(["add", ".gitignore"], projectRoot);
  git(["commit", "-m", "chore: move beads board off main onto beads-board branch"], projectRoot);

  recoverBeforeAdd({ projectRoot });
  try {
    provisionBoardWorktree({ projectRoot });
  } catch (err) {
    if (err instanceof BoardWorktreeError) {
      console.error(`BOARD_MIGRATE_PARTIAL_FAILURE: ${err.message}`);
      return 1;
    }
    throw err;
  }
  clearBoardMigrateCheckpoint(projectRoot);
  console.log("Migrated .beads/ to the beads-board linked-worktree topology.");
  return 0;
}

export default { run, help };
