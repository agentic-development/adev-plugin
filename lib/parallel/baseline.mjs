// lib/parallel/baseline.mjs
//
// Record the orchestrator's pre-dispatch baseline and assert it is unpolluted
// after a parallel run's join, before any merge-back. Implements the SA-2
// safeguard from parallel-implement.spec.md: a group subagent that mis-directs a
// commit or edit onto the orchestrator branch (instead of its worktree) is caught
// here and aborts the whole run before any merge lands on a corrupted base.
//
// Zero-dependency; reuses WorktreeError from the primitive for a uniform error surface.

import { execFileSync } from "node:child_process";
import { WorktreeError } from "../worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * Capture the orchestrator's current branch, HEAD sha, and clean-tree state.
 * @param {string} [cwd]
 * @returns {{ branch: string, head: string, clean: boolean }}
 */
export function recordBaseline(cwd = process.cwd()) {
  const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
  const head = git(["rev-parse", "HEAD"], cwd);
  const clean = git(["status", "--porcelain"], cwd) === "";
  return { branch, head, clean };
}

/**
 * Assert the orchestrator branch still matches the recorded baseline and the
 * working tree is clean. Throws WorktreeError(ORCHESTRATOR_POLLUTED) otherwise.
 *
 * @param {string} cwd
 * @param {{ branch: string, head: string }} baseline
 * @returns {{ ok: true }}
 */
export function assertOrchestratorClean(cwd, baseline) {
  const head = git(["rev-parse", "HEAD"], cwd);
  if (head !== baseline.head) {
    throw new WorktreeError(
      "ORCHESTRATOR_POLLUTED",
      `orchestrator branch HEAD moved during the parallel run (baseline ${baseline.head.slice(0, 7)} → ${head.slice(0, 7)}); a subagent likely committed onto the orchestrator branch instead of its worktree — aborting before merge`,
    );
  }
  const dirty = git(["status", "--porcelain"], cwd) !== "";
  if (dirty) {
    throw new WorktreeError(
      "ORCHESTRATOR_POLLUTED",
      "orchestrator working tree is dirty after the parallel run (stray edit outside a worktree); tree must be clean before merge-back — aborting",
    );
  }
  return { ok: true };
}
