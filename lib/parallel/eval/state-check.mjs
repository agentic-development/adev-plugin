// lib/parallel/eval/state-check.mjs
//
// Two eval assertions for the equivalence harness (equivalence-eval.spec.md):
//
//   assertGroupSelection — `--parallel` must create worktrees ONLY for the plan's
//     `independent` groups; a `sequential` (file-overlapping) group must run in the
//     serial lane. A sequential slug among the created worktrees raises
//     OVERLAP_PARALLELIZED. (This tests --parallel's group-*selection*, not
//     disjointness re-checking, which is /adev:plan's job.)
//
//   scanOrphanedState / assertNoOrphans — after an ALL-SUCCESS parallel run, no
//     adev worktree / `adev/*` branch / stale tasks.json.lock may remain
//     (ORPHANED_STATE). Retained worktrees after a *failed* group are by-design and
//     are NOT scanned here — the caller only asserts on full success.
//
// Zero-dependency; reuses lib/worktree.mjs (list) + WorktreeError.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WorktreeError, list, resolveMainRoot } from "../../worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * @param {object} o
 * @param {string[]} o.independentSlugs  slugs of independent groups
 * @param {string[]} o.sequentialSlugs   slugs of sequential (overlapping) groups
 * @param {string[]} o.createdSlugs      slugs for which a worktree was created during the run
 * @returns {{ ok: true }}
 */
export function assertGroupSelection({ independentSlugs = [], sequentialSlugs = [], createdSlugs = [] }) {
  const seq = new Set(sequentialSlugs);
  const violating = createdSlugs.filter((s) => seq.has(s));
  if (violating.length > 0) {
    throw new WorktreeError(
      "OVERLAP_PARALLELIZED",
      `--parallel created a worktree for sequential (file-overlapping) group(s) ${violating.join(", ")} — these must run in the serial lane`,
    );
  }
  const ind = new Set(independentSlugs);
  const stray = createdSlugs.filter((s) => !ind.has(s));
  if (stray.length > 0) {
    throw new WorktreeError(
      "OVERLAP_PARALLELIZED",
      `--parallel created worktree(s) ${stray.join(", ")} not corresponding to any independent group`,
    );
  }
  return { ok: true };
}

/**
 * Scan for adev-managed leftover state. Intended for use only after an
 * all-success run (retained-on-failure worktrees are by-design, not orphaned).
 * @param {string} [cwd]
 * @returns {{ worktrees: string[], branches: string[], lock: boolean }}
 */
export function scanOrphanedState(cwd = process.cwd()) {
  const worktrees = list({ cwd }).map((w) => w.slug);
  let branches = [];
  try {
    const out = git(["branch", "--list", "adev/*", "--format=%(refname:short)"], cwd);
    branches = out ? out.split("\n").filter(Boolean) : [];
  } catch {
    /* ignore */
  }
  const mainRoot = resolveMainRoot(cwd);
  const lock = existsSync(join(mainRoot, ".context-index", "tasks", "tasks.json.lock"));
  return { worktrees, branches, lock };
}

/**
 * @param {string} [cwd]
 * @returns {{ ok: true }}
 */
export function assertNoOrphans(cwd = process.cwd()) {
  const s = scanOrphanedState(cwd);
  if (s.worktrees.length || s.branches.length || s.lock) {
    throw new WorktreeError(
      "ORPHANED_STATE",
      `orphaned adev state after an all-success run: ${s.worktrees.length} worktree(s), ${s.branches.length} branch(es)${s.lock ? ", stale tasks.json.lock" : ""}`,
    );
  }
  return { ok: true };
}
