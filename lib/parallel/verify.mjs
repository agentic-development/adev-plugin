// lib/parallel/verify.mjs
//
// Per-group completeness verification for /adev:implement --parallel (SA-1 from
// parallel-implement.spec.md). "Head advanced" alone proves non-emptiness, not
// completeness — a group of N tasks that commits task 1 and drops 2..N would
// pass a naive check and merge as success, breaking parallel≡serial. So this
// verifies BOTH: (a) every task in the group is `done` (from the plan-task
// projection), and (b) the group branch advanced past the base. Either failure
// raises COMMITS_NOT_VERIFIED and the group is treated as failed (not merged).
//
// Pure git + injected done-state; the CLI verb supplies `doneTasks` from
// currentState(...).planTasks so this module stays unit-testable and lifecycle-free.

import { execFileSync } from "node:child_process";
import { WorktreeError } from "../worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} opts.branch  the group's branch (adev/<slug>-<group>)
 * @param {string} opts.base    the pre-dispatch base sha
 * @param {string[]} opts.tasks task ids that belong to this group
 * @param {string[]|Set<string>} opts.doneTasks task ids currently marked done
 * @returns {{ ok: true, commitCount: number }}
 */
export function verifyGroupComplete({ cwd, branch, base, tasks = [], doneTasks = [] }) {
  const done = doneTasks instanceof Set ? doneTasks : new Set(doneTasks);
  const missing = tasks.filter((t) => !done.has(String(t)));
  if (missing.length > 0) {
    throw new WorktreeError(
      "COMMITS_NOT_VERIFIED",
      `group branch ${branch} is missing completed work for task(s) ${missing.join(", ")} — partial commit, not merging`,
    );
  }
  const count = Number(git(["rev-list", "--count", `${base}..${branch}`], cwd));
  if (!Number.isFinite(count) || count < 1) {
    throw new WorktreeError(
      "COMMITS_NOT_VERIFIED",
      `group branch ${branch} has no commits past base — did not advance`,
    );
  }
  return { ok: true, commitCount: count };
}
