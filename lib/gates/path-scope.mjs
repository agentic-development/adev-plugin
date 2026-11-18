/**
 * Run-time selection of path-scoped gates.
 *
 * A gate that declares `paths` runs only when the change under test touches a
 * matching file. Selection never removes a gate from the resolved set: every
 * gate keeps its row (and its `command_sha`), and a gate that does not apply
 * carries `applies: false` with a reason, so Check 1 can record it as `skip`
 * rather than omit it — an omitted gate reads as "never declared".
 *
 * @module lib/gates/path-scope
 */

import { execFileSync } from "node:child_process";

import { codedError as coded } from "../errors.mjs";
import { computeTouchedFiles } from "../implement/review-depth.mjs";
import { matchGlob } from "../test-strategies/manifest.mjs";

/** The `--changed-since` value that means "since the merge base with the default branch". */
export const MERGE_BASE = "merge-base";

/**
 * Annotate each gate with `applies`.
 *
 * `changedFiles === null` means the change set is unknown; every gate then
 * applies, because running a gate that was not needed is the safe failure and
 * skipping one that was is not.
 *
 * @param {object[]} gates Resolved gates.
 * @param {string[]|null} changedFiles Project-relative paths.
 * @returns {object[]} New gate objects.
 */
export function applyPathScope(gates, changedFiles) {
  return gates.map((gate) => {
    if (!Array.isArray(gate.paths) || changedFiles === null) return { ...gate, applies: true };
    const matched = changedFiles.filter((f) => gate.paths.some((p) => matchGlob(p, f)));
    if (matched.length > 0) return { ...gate, applies: true, matched_files: matched.length };
    return {
      ...gate,
      applies: false,
      skip_reason: `no changed file matches paths (${gate.paths.join(", ")})`,
    };
  });
}

function git(projectRoot, args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Resolve `merge-base` to the merge base of HEAD with the default branch:
 * `origin/HEAD` when the remote names one, else `main`, else `master`.
 *
 * @param {string} projectRoot
 * @returns {string} commit id
 * @throws {Error} `CHANGED_BASE_UNRESOLVED`
 */
function resolveMergeBase(projectRoot) {
  const candidates = [];
  try {
    candidates.push(git(projectRoot, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]));
  } catch {
    // no remote default recorded
  }
  candidates.push("main", "master");
  for (const ref of candidates) {
    try {
      return git(projectRoot, ["merge-base", "HEAD", ref]);
    } catch {
      // try the next candidate
    }
  }
  throw coded(
    "CHANGED_BASE_UNRESOLVED",
    "no merge base with origin/HEAD, main or master — the change set is unknown",
  );
}

/**
 * Files changed since `base`, including uncommitted and untracked ones.
 * Deleted files count: removing a migration is a change to migrations.
 *
 * @param {string} projectRoot
 * @param {string} base A commit, a tree from `adev implement snapshot-base`, or `merge-base`.
 * @returns {string[]}
 * @throws {Error} `CHANGED_BASE_UNRESOLVED` when the base cannot be read.
 */
export function changedFilesSince(projectRoot, base) {
  const resolved = base === MERGE_BASE ? resolveMergeBase(projectRoot) : base;
  try {
    return computeTouchedFiles(projectRoot, resolved).map((r) => r.path);
  } catch (err) {
    throw coded(
      "CHANGED_BASE_UNRESOLVED",
      `cannot diff against '${base}': ${err?.message ?? String(err)}`,
    );
  }
}
