// lib/issues/board-worktree.mjs
//
// Bootstrap helper for the shared beads issue board's git worktree at
// `.beads/`. Owns the orphan-branch-vs-existing-branch bootstrap decision
// (spec behaviors BEH-2/BEH-3) and the corrupt-leftover recovery sequence
// (filesystem delete -> `git worktree prune`) used both by fresh-bootstrap
// retries and by the migration tool's re-provisioning step.
//
// Zero-dependency: Node built-ins only (child_process, fs, path). All git
// invocations use execFileSync with argv arrays — never a shell string.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { safeRealpath } from "../path-safety.mjs";

/** Relative path (from projectRoot) to the board worktree checkout. */
const BOARD_DIR = ".beads";
/** Branch name the board worktree is checked out on. */
const BOARD_BRANCH = "beads-board";

export class BoardWorktreeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BoardWorktreeError";
    this.code = code;
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * Whether `ref` resolves to an existing commit-ish. Non-zero exit (ref does
 * not exist) is treated as "false", not propagated.
 *
 * @param {string} ref
 * @param {string} cwd
 * @returns {boolean}
 */
function refExists(ref, cwd) {
  try {
    git(["rev-parse", "--verify", "--quiet", ref], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse `git worktree list --porcelain` for the set of registered worktree
 * absolute paths.
 *
 * @param {string} cwd
 * @returns {string[]}
 */
function listWorktreePaths(cwd) {
  let out;
  try {
    out = git(["worktree", "list", "--porcelain"], cwd);
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => safeRealpath(line.slice("worktree ".length)));
}

/**
 * Delete-then-prune corrupt-leftover recovery. Run unconditionally before
 * every re-provisioning `git worktree add` attempt.
 *
 * Steps:
 *   1. If `.beads/` exists on disk, remove its contents with a plain
 *      filesystem delete — NOT `git worktree remove`, since an interrupted
 *      prior `git worktree add` may not have registered cleanly enough for
 *      git to recognize it as a valid worktree to remove.
 *   2. Run `git worktree prune` (best-effort — swallow errors) to clear any
 *      stale `.git/worktrees/.beads` administrative entry.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 */
export function recoverBeforeAdd({ projectRoot }) {
  const boardPath = join(projectRoot, BOARD_DIR);
  if (existsSync(boardPath)) {
    rmSync(boardPath, { recursive: true, force: true });
  }
  try {
    git(["worktree", "prune"], projectRoot);
  } catch {
    // Intentionally broad swallow: this is best-effort cleanup that must
    // never itself block recovery (e.g. a missing/uninitialized .git dir).
    // Any real underlying problem surfaces downstream anyway, at the
    // `git worktree add` call this recovery precedes.
  }
}

/**
 * Provision the `.beads/` board worktree, deciding between an existing
 * `beads-board` branch (BEH-2) and a fresh orphan branch (BEH-3).
 *
 * Idempotent: calling this against an already-provisioned `.beads/` returns
 * `{ mode: "already-provisioned", created: false }` without attempting
 * `git worktree add` again.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @returns {{ mode: "already-provisioned"|"existing-branch"|"orphan", created: boolean }}
 */
export function provisionBoardWorktree({ projectRoot }) {
  const boardPath = join(projectRoot, BOARD_DIR);

  if (existsSync(boardPath)) {
    const resolvedBoardPath = safeRealpath(boardPath);
    const registeredPaths = listWorktreePaths(projectRoot);
    if (registeredPaths.includes(resolvedBoardPath)) {
      return { mode: "already-provisioned", created: false };
    }

    // Plain (non-worktree) directory. Empty is fine — falls through to
    // provisioning below (git worktree add requires the target be empty or
    // absent, which an empty dir satisfies). Non-empty is a conflict.
    const entries = readdirSync(boardPath);
    if (entries.length > 0) {
      throw new BoardWorktreeError(
        "BOARD_ALREADY_EXISTS",
        `${boardPath} already exists as a non-empty plain directory (not a registered git worktree). ` +
          "Run `adev issues board migrate` instead of a raw `git worktree add`.",
      );
    }
  }

  const hasLocalBranch = refExists(`refs/heads/${BOARD_BRANCH}`, projectRoot);
  const hasRemoteBranch = refExists(`refs/remotes/origin/${BOARD_BRANCH}`, projectRoot);

  if (hasLocalBranch || hasRemoteBranch) {
    try {
      git(["worktree", "add", BOARD_DIR, BOARD_BRANCH], projectRoot);
    } catch (err) {
      throw new BoardWorktreeError(
        "BOARD_ADD_FAILED",
        `git worktree add ${BOARD_DIR} ${BOARD_BRANCH} failed: ${err.stderr?.toString?.().trim() || err.message}`,
      );
    }
    return { mode: "existing-branch", created: true };
  }

  try {
    git(["worktree", "add", "--orphan", "-b", BOARD_BRANCH, BOARD_DIR], projectRoot);
  } catch (err) {
    throw new BoardWorktreeError(
      "BOARD_ADD_FAILED",
      `git worktree add --orphan -b ${BOARD_BRANCH} ${BOARD_DIR} failed: ${err.stderr?.toString?.().trim() || err.message}`,
    );
  }
  return { mode: "orphan", created: true };
}
