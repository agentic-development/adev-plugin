// lib/worktree.mjs
//
// adev-managed git worktrees for parallel, isolated lifecycle execution.
//
// Rationale (see tests/evals/worktree-parallelization/TEST-PLAN.md):
//   The Claude Code harness's `isolation: "worktree"` on Agent dispatch is the
//   wrong tool for a lifecycle orchestrator — it auto-creates/auto-cleans, does
//   not compose with subagent commits, and NESTS when dispatched from inside an
//   existing worktree (`.claude/worktrees/…`), producing 8+ deep trees. adev
//   therefore manages its OWN worktrees:
//
//     - anchored to the MAIN repo root (via `git rev-parse --git-common-dir`),
//       so they never nest regardless of the invoking cwd,
//     - under a controlled path (`<mainRoot>/.adev/worktrees/<slug>`),
//     - on an explicit branch (`adev/<slug>`),
//     - with an explicit lifecycle (add → merge → remove) that the orchestrator
//       drives, not the harness.
//
// The shared issue board (CAS-locked JsonAdapter) and milestones already resolve
// to the main root via lib/issues/resolve-root.mjs, so parallel worktrees
// coordinate safely; lifecycle/build/execution state is per-worktree by design.
//
// Zero-dependency: Node built-ins only (child_process, path, fs).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

/** Controlled parent directory (relative to main repo root) for adev worktrees. */
export const WORKTREE_SUBDIR = join(".adev", "worktrees");
/** Branch namespace for adev-managed worktrees. */
export const BRANCH_PREFIX = "adev/";

/** Slug must be a safe path segment: no traversal, no separators, bounded. */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

export class WorktreeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorktreeError";
    this.code = code;
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * Resolve the MAIN repository working tree root from any cwd, including from
 * inside a linked worktree. Mirrors lib/issues/resolve-root.mjs so adev
 * worktrees are always anchored to the primary checkout and never nest.
 *
 * @param {string} [cwd]
 * @returns {string} absolute path to the main repo root
 */
export function resolveMainRoot(cwd = process.cwd()) {
  const commonDir = git(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    cwd,
  );
  // --git-common-dir points at the main repo's `.git`; its parent is the root.
  return dirname(commonDir);
}

/**
 * Detect whether `cwd` sits inside a worktree checkout that adev must not nest
 * a new worktree beneath — either a harness worktree (`.claude/worktrees/`) or
 * an existing adev worktree (`.adev/worktrees/`). Anchoring to the main root
 * (resolveMainRoot) already prevents physical nesting; this guard lets callers
 * fall back to serial execution and surface a clear reason.
 *
 * @param {string} [cwd]
 * @returns {{ nested: boolean, kind: 'harness'|'adev'|null }}
 */
export function detectNesting(cwd = process.cwd()) {
  const norm = resolve(cwd) + sep;
  if (norm.includes(`${sep}.claude${sep}worktrees${sep}`)) {
    return { nested: true, kind: "harness" };
  }
  if (norm.includes(`${sep}.adev${sep}worktrees${sep}`)) {
    return { nested: true, kind: "adev" };
  }
  return { nested: false, kind: null };
}

function assertValidSlug(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new WorktreeError(
      "INVALID_SLUG",
      `invalid worktree slug ${JSON.stringify(slug)} — expected [a-z0-9._-], <=100 chars, no path separators`,
    );
  }
}

/**
 * Absolute path + branch name for a slug's worktree, anchored to the main root.
 * @param {string} slug
 * @param {string} [cwd]
 */
export function worktreePathFor(slug, cwd = process.cwd()) {
  assertValidSlug(slug);
  const mainRoot = resolveMainRoot(cwd);
  return {
    mainRoot,
    path: join(mainRoot, WORKTREE_SUBDIR, slug),
    branch: `${BRANCH_PREFIX}${slug}`,
  };
}

/**
 * Parse `git worktree list --porcelain` into structured records.
 * @param {string} cwd
 * @returns {Array<{ path: string, head: string|null, branch: string|null }>}
 */
function listRaw(cwd) {
  const out = git(["worktree", "list", "--porcelain"], cwd);
  const records = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur) records.push(cur);
      cur = { path: line.slice("worktree ".length), head: null, branch: null };
    } else if (line.startsWith("HEAD ")) {
      if (cur) cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      // e.g. "branch refs/heads/adev/foo"
      if (cur) cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "" && cur) {
      records.push(cur);
      cur = null;
    }
  }
  if (cur) records.push(cur);
  return records;
}

/**
 * List adev-managed worktrees (those under `<mainRoot>/.adev/worktrees/`).
 * @param {object} opts
 * @param {string} [opts.cwd]
 * @returns {Array<{ slug: string, path: string, branch: string|null, head: string|null }>}
 */
export function list({ cwd = process.cwd() } = {}) {
  const mainRoot = resolveMainRoot(cwd);
  const prefix = join(mainRoot, WORKTREE_SUBDIR) + sep;
  return listRaw(cwd)
    .filter((r) => resolve(r.path).startsWith(prefix))
    .map((r) => ({
      slug: resolve(r.path).slice(prefix.length),
      path: r.path,
      branch: r.branch,
      head: r.head,
    }));
}

/**
 * Create (or return the existing) adev worktree for `slug`.
 *
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} [opts.baseRef]  ref to branch from (default: current HEAD)
 * @param {string} [opts.cwd]
 * @returns {{ slug: string, path: string, branch: string, created: boolean, mainRoot: string }}
 */
export function add({ slug, baseRef, cwd = process.cwd() } = {}) {
  const { mainRoot, path, branch } = worktreePathFor(slug, cwd);

  // Idempotency: if a worktree already exists at this path, return it.
  const existing = listRaw(cwd).find((r) => resolve(r.path) === resolve(path));
  if (existing) {
    return { slug, path, branch: existing.branch || branch, created: false, mainRoot };
  }

  mkdirSync(join(mainRoot, WORKTREE_SUBDIR), { recursive: true });

  const base = baseRef || git(["rev-parse", "HEAD"], cwd);
  // If the branch already exists (e.g. from a prior run), check it out; else create.
  const branchExists = (() => {
    try {
      git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], mainRoot);
      return true;
    } catch {
      return false;
    }
  })();

  const args = branchExists
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, base];
  try {
    git(args, mainRoot);
  } catch (err) {
    throw new WorktreeError(
      "ADD_FAILED",
      `git worktree add failed for ${slug}: ${err.stderr?.toString?.().trim() || err.message}`,
    );
  }
  return { slug, path, branch, created: true, mainRoot };
}

/**
 * Merge an adev worktree's branch back into `intoRef` (the caller's current
 * branch by default). Detects conflicts and aborts cleanly, leaving the
 * worktree intact for inspection.
 *
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} [opts.cwd]
 * @param {boolean} [opts.noFf]  create a merge commit even if fast-forwardable
 * @returns {{ slug: string, branch: string, merged: boolean, conflicts: string[] }}
 */
export function merge({ slug, cwd = process.cwd(), noFf = false } = {}) {
  const { mainRoot, branch } = worktreePathFor(slug, cwd);
  const ffArgs = noFf ? ["--no-ff"] : [];
  try {
    git(["merge", ...ffArgs, "--no-edit", branch], mainRoot);
    return { slug, branch, merged: true, conflicts: [] };
  } catch (err) {
    // Collect conflicted paths, then abort so the tree is left clean.
    let conflicts = [];
    try {
      const out = git(["diff", "--name-only", "--diff-filter=U"], mainRoot);
      conflicts = out ? out.split("\n").filter(Boolean) : [];
    } catch {
      /* ignore */
    }
    try {
      git(["merge", "--abort"], mainRoot);
    } catch {
      /* ignore */
    }
    throw new WorktreeError(
      "MERGE_CONFLICT",
      `merge of ${branch} conflicts on ${conflicts.length} file(s): ${conflicts.join(", ")}`,
    );
  }
}

/**
 * Remove an adev worktree (and optionally delete its branch).
 *
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} [opts.cwd]
 * @param {boolean} [opts.force]  remove even with uncommitted changes
 * @param {boolean} [opts.deleteBranch]  also delete the adev/<slug> branch
 * @returns {{ slug: string, removed: boolean }}
 */
export function remove({ slug, cwd = process.cwd(), force = false, deleteBranch = false } = {}) {
  const { mainRoot, path, branch } = worktreePathFor(slug, cwd);
  const args = ["worktree", "remove", ...(force ? ["--force"] : []), path];
  try {
    git(args, mainRoot);
  } catch (err) {
    throw new WorktreeError(
      "REMOVE_FAILED",
      `git worktree remove failed for ${slug}: ${err.stderr?.toString?.().trim() || err.message}`,
    );
  }
  if (deleteBranch) {
    try {
      git(["branch", force ? "-D" : "-d", branch], mainRoot);
    } catch {
      /* non-fatal: branch may be unmerged or already gone */
    }
  }
  return { slug, removed: true };
}
