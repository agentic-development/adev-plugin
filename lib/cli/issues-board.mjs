/**
 * `adev issues board [--milestone <name>] [--json]` — print the whole issue
 * board as canonical markdown (read-only), and
 * `adev issues board migrate [--dry-run]` — one-shot, idempotent, resumable
 * migration of the beads board (`.beads/issues.jsonl`) off `main`'s git
 * history onto a dedicated orphan `beads-board` branch, checked out as a
 * linked worktree at `.beads/` (BEH-7/BEH-8/BEH-9).
 *
 * Two independently-designed verbs share this module because they share the
 * `board` name: dispatch on the first positional arg — `"migrate"` routes to
 * the git-topology migration, anything else (including no args, or flags
 * like `--milestone`/`--json`) routes to the read-only board print. `migrate`
 * can never collide with a flag since flags always start with `--`.
 *
 * Why the print verb exists: the `/adev:issues` Board Display step used to be
 * a pair of fenced-JS blocks telling the agent to import `getIssueManager`
 * and `renderTasksMd` itself. That is a lib directive with runtime semantics
 * and no CLI surface behind it, so an agent reading the step has nowhere to
 * go but the backend binary — and a raw `br` call resolves `.beads/` from
 * CWD, which inside a linked worktree opens the git-tracked `issues.jsonl`
 * with no `beads.db` beside it and dies with SYNC_CONFLICT. Going through the
 * adapter fixes that for free: `getIssueManager()` resolves the storage root
 * via the git common dir, so a board read from any worktree shows the one
 * real board. Read-only by construction — this verb NEVER writes a file;
 * `adev status --render` remains the only writer of
 * `.context-index/tasks/tasks.md`, and the two are not interchangeable.
 *
 * Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
 * Spec: .context-index/specs/features/cli-driver-surface/issues-skill-lib-directive-extraction.spec.md
 * Plan-task: 6, 7
 *
 * Contract (new-pattern CLI helper, mirrors lib/cli/issues-migrate.mjs and
 * the other lib/cli/issues-*.mjs sub-verb modules):
 *   - exports `run({ projectRoot, argv, manifest })` returning a numeric exit code
 *   - exports `help()` printing usage to stdout
 *
 * Uses only Node.js built-ins plus in-repo helpers (no new dependency).
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { getIssueManager } from "../issues/registry.mjs";
import { renderTasksMd } from "../issues/render-markdown.mjs";
import { ensureManagedBlock } from "../gitignore-installer.mjs";
import { provisionBoardWorktree, recoverBeforeAdd, BoardWorktreeError } from "../issues/board-worktree.mjs";
import {
  writeBoardMigrateCheckpoint,
  readBoardMigrateCheckpoint,
  clearBoardMigrateCheckpoint,
} from "../issues/board-migrate-state.mjs";
import { safeRealpath } from "../path-safety.mjs";

const PRINT_USAGE = "usage: adev issues board [--milestone <name>] [--json]";

const PRINT_OPTIONS = {
  milestone: { type: "string" },
  json: { type: "boolean" },
};

/**
 * `adev issues board [--milestone <name>] [--json]`.
 *
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
async function runPrint({ projectRoot, argv, manifest }) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: PRINT_OPTIONS, allowPositionals: true });
  } catch (err) {
    console.error(err.message);
    console.error(PRINT_USAGE);
    return 1;
  }

  if (parsed.positionals.length > 0) {
    console.error(PRINT_USAGE);
    return 1;
  }

  const epicFilters = {};
  if (parsed.values.milestone !== undefined) {
    epicFilters.milestone = parsed.values.milestone;
  }

  let epics;
  let issues;
  try {
    const manager = getIssueManager(manifest, projectRoot);
    epics = await manager.listEpics(epicFilters);
    issues = await manager.list();
  } catch (err) {
    console.error(err.code ? `${err.code}: ${err.message}` : err.message);
    return 1;
  }

  const board = { version: 1, epics, issues };

  if (parsed.values.json) {
    console.log(JSON.stringify(board, null, 2));
    return 0;
  }

  // `renderTasksMd` already terminates its output with a newline, and
  // console.log appends one of its own. Drop the trailing newline so stdout
  // is byte-identical to the renderer's output — the skill displays this
  // verbatim, and `adev status --render` writes the same bytes to tasks.md.
  const markdown = renderTasksMd(board);
  console.log(markdown.endsWith("\n") ? markdown.slice(0, -1) : markdown);
  return 0;
}

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
 * see the comment in `runMigrate()` for why: the no-man's-land between
 * main-tree cleanup landing and re-provisioning finishing looks identical to
 * "nothing to migrate" from this function's point of view alone.
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

/**
 * `adev issues board migrate [--dry-run]`.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {string[]} opts.argv - argv after `migrate` (e.g. `[]` or `["--dry-run"]`)
 * @returns {Promise<number>} exit code
 */
async function runMigrate({ projectRoot, argv }) {
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

/**
 * @param {{ projectRoot: string, argv: string[], manifest: object|null }} ctx
 * @returns {Promise<number>} exit code
 */
export async function run({ projectRoot, argv, manifest }) {
  if (argv?.[0] === "migrate") {
    return runMigrate({ projectRoot, argv: argv.slice(1) });
  }
  return runPrint({ projectRoot, argv: argv ?? [], manifest });
}

export function help() {
  console.log(PRINT_USAGE);
  console.log("       adev issues board migrate [--dry-run]");
  console.log("");
  console.log("With no positional argument, print the whole issue board as canonical");
  console.log("markdown — the same layout `adev status --render` writes to");
  console.log(".context-index/tasks/tasks.md. Epics first, then open issues grouped by");
  console.log("epic, then closed issues collapsed under a <details> block. Read-only:");
  console.log("this form never writes a file. --milestone restricts the epics section");
  console.log("to one milestone; --json emits { version, epics, issues } unrendered.");
  console.log("");
  console.log("`migrate` instead moves the beads board's git topology: one-shot,");
  console.log("idempotent, resumable migration of .beads/issues.jsonl off main's git");
  console.log("history onto a dedicated orphan beads-board branch, checked out as a");
  console.log("linked worktree at .beads/. --dry-run previews without mutating.");
  console.log("");
  console.log("Always prefer this verb over calling the backend binary (`br list`,");
  console.log("`br` migration commands, …) directly: the storage root is resolved from");
  console.log("the git common dir, so a board read or migrated from a linked worktree");
  console.log("reaches the one real board. A raw `br` call in a worktree fails with");
  console.log("SYNC_CONFLICT instead.");
}

export default { run, help };
