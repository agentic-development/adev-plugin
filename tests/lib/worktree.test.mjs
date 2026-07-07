// tests/lib/worktree.test.mjs
//
// Unit + integration tests for lib/worktree.mjs — adev-managed git worktrees
// for parallel isolated lifecycle execution.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  add,
  list,
  merge,
  remove,
  detectNesting,
  worktreePathFor,
  resolveMainRoot,
  WorktreeError,
  WORKTREE_SUBDIR,
} from "../../lib/worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function mkRepo() {
  const raw = join(tmpdir(), `adev-wt-${Date.now()}-${Math.floor(process.hrtime()[1])}`);
  mkdirSync(raw, { recursive: true });
  // Canonicalize (macOS /var -> /private/var) so path assertions match git's
  // resolved, absolute worktree paths.
  const dir = realpathSync(raw);
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t.co"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "file.txt"), "base\n");
  git(["add", "."], dir);
  git(["commit", "-qm", "init"], dir);
  return dir;
}

describe("lib/worktree", () => {
  let repo;
  before(() => {
    repo = mkRepo();
  });
  after(() => {
    // Best-effort: prune worktrees then remove the repo tree.
    try {
      git(["worktree", "prune"], repo);
    } catch {
      /* ignore */
    }
    rmSync(repo, { recursive: true, force: true });
  });

  describe("detectNesting", () => {
    it("reports not-nested at the main repo root", () => {
      assert.deepEqual(detectNesting(repo), { nested: false, kind: null });
    });
    it("detects a harness worktree path", () => {
      const r = detectNesting(join(repo, ".claude", "worktrees", "agent-x", "src"));
      assert.equal(r.nested, true);
      assert.equal(r.kind, "harness");
    });
    it("detects an adev worktree path", () => {
      const r = detectNesting(join(repo, ".adev", "worktrees", "feat-a"));
      assert.equal(r.nested, true);
      assert.equal(r.kind, "adev");
    });
  });

  describe("worktreePathFor + slug validation", () => {
    it("anchors path to the main root under .adev/worktrees", () => {
      const { path, branch } = worktreePathFor("feat-x", repo);
      assert.equal(path, join(repo, WORKTREE_SUBDIR, "feat-x"));
      assert.equal(branch, "adev/feat-x");
    });
    it("rejects path-traversal / separator slugs", () => {
      for (const bad of ["../evil", "a/b", "", ".", "x".repeat(101)]) {
        assert.throws(() => worktreePathFor(bad, repo), (e) => e instanceof WorktreeError && e.code === "INVALID_SLUG");
      }
    });
  });

  describe("add / list / remove lifecycle", () => {
    it("creates a worktree on branch adev/<slug>", () => {
      const res = add({ slug: "grp-a", cwd: repo });
      assert.equal(res.created, true);
      assert.equal(res.branch, "adev/grp-a");
      assert.ok(existsSync(res.path));
      assert.equal(git(["branch", "--show-current"], res.path), "adev/grp-a");
    });

    it("is idempotent — re-add returns created:false", () => {
      const res = add({ slug: "grp-a", cwd: repo });
      assert.equal(res.created, false);
    });

    it("list returns only adev-managed worktrees", () => {
      const items = list({ cwd: repo });
      assert.ok(items.find((w) => w.slug === "grp-a"));
      assert.ok(items.every((w) => w.path.includes(WORKTREE_SUBDIR)));
    });

    it("remove deletes the worktree (and branch on request)", () => {
      const { path } = worktreePathFor("grp-a", repo);
      remove({ slug: "grp-a", cwd: repo, force: true, deleteBranch: true });
      assert.equal(existsSync(path), false);
      assert.equal(list({ cwd: repo }).find((w) => w.slug === "grp-a"), undefined);
      assert.throws(() => git(["rev-parse", "--verify", "refs/heads/adev/grp-a"], repo));
    });
  });

  describe("nesting prevention (the core safety property)", () => {
    it("add from INSIDE a worktree anchors to main root, does not nest", () => {
      const a = add({ slug: "outer", cwd: repo });
      // invoke add with cwd = the outer worktree
      const b = add({ slug: "inner", cwd: a.path });
      assert.equal(b.mainRoot, repo);
      assert.equal(b.path, join(repo, WORKTREE_SUBDIR, "inner"));
      assert.equal(existsSync(join(a.path, ".adev", "worktrees", "inner")), false);
      remove({ slug: "outer", cwd: repo, force: true, deleteBranch: true });
      remove({ slug: "inner", cwd: repo, force: true, deleteBranch: true });
    });

    it("resolveMainRoot returns the same root from a linked worktree", () => {
      const a = add({ slug: "root-check", cwd: repo });
      assert.equal(resolveMainRoot(a.path), repo);
      remove({ slug: "root-check", cwd: repo, force: true, deleteBranch: true });
    });
  });

  describe("merge", () => {
    it("merges non-conflicting worktree changes back to the base branch", () => {
      const a = add({ slug: "clean-merge", cwd: repo });
      writeFileSync(join(a.path, "added.txt"), "new\n");
      git(["add", "."], a.path);
      git(["commit", "-qm", "add file"], a.path);

      const res = merge({ slug: "clean-merge", cwd: repo });
      assert.equal(res.merged, true);
      assert.deepEqual(res.conflicts, []);
      assert.ok(existsSync(join(repo, "added.txt")));

      remove({ slug: "clean-merge", cwd: repo, force: true, deleteBranch: true });
    });

    it("detects conflicts, aborts, and leaves the tree clean", () => {
      // main advances file.txt; worktree edits the same line → conflict.
      const a = add({ slug: "conflict", cwd: repo });
      writeFileSync(join(a.path, "file.txt"), "worktree-change\n");
      git(["add", "."], a.path);
      git(["commit", "-qm", "wt edit"], a.path);

      writeFileSync(join(repo, "file.txt"), "main-change\n");
      git(["add", "."], repo);
      git(["commit", "-qm", "main edit"], repo);

      assert.throws(
        () => merge({ slug: "conflict", cwd: repo }),
        (e) => e instanceof WorktreeError && e.code === "MERGE_CONFLICT" && /file\.txt/.test(e.message),
      );
      // merge --abort must have run: no MERGE_HEAD, clean status.
      assert.throws(() => git(["rev-parse", "--verify", "MERGE_HEAD"], repo));
      assert.equal(git(["status", "--porcelain"], repo), "");

      remove({ slug: "conflict", cwd: repo, force: true, deleteBranch: true });
    });
  });
});
