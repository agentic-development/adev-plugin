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

    it("rejects a dash-prefixed baseRef (argument-injection hardening, SEC-1)", () => {
      assert.throws(
        () => add({ slug: "grp-inj", baseRef: "--foo", cwd: repo }),
        (e) => e instanceof WorktreeError && e.code === "INVALID_BASEREF",
      );
      // and no worktree/branch was created for the rejected slug
      assert.equal(list({ cwd: repo }).find((w) => w.slug === "grp-inj"), undefined);
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

  describe("merge — non-conflict failures (adev-plugin-62qz)", () => {
    // These exercise the "merge succeeded, commit rejected" shape: git writes
    // MERGE_HEAD and stages the merge, then a commit-msg hook rejects the
    // implicit commit `git merge` tries to make. `--diff-filter=U` reports NO
    // conflicted paths here (there never were any) — the old code mistook
    // that for "conflict on 0 files" and threw away the staged merge with an
    // unconditional `merge --abort`. The fix must tell this apart from a real
    // conflict AND from a merge that never got far enough to stage anything.

    function installRejectingCommitMsgHook(repoDir, scriptBody) {
      const hooksDir = join(repoDir, ".git", "hooks");
      mkdirSync(hooksDir, { recursive: true });
      const hookPath = join(hooksDir, "commit-msg");
      writeFileSync(hookPath, `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 });
    }

    function removeCommitMsgHook(repoDir) {
      rmSync(join(repoDir, ".git", "hooks", "commit-msg"), { force: true });
    }

    it("commit-msg hook rejecting the merge commit reports MERGE_FAILED (not MERGE_CONFLICT), and leaves the merge staged rather than aborting", () => {
      const a = add({ slug: "hook-reject", cwd: repo });
      writeFileSync(join(a.path, "hookfile.txt"), "from-worktree\n");
      git(["add", "."], a.path);
      git(["commit", "-qm", "wt adds hookfile"], a.path);

      // Mirror this repo's own .githooks/commit-msg rejection wording for a
      // missing Spec: trailer, so the hook-specific detection (part c) has
      // real text to match against.
      installRejectingCommitMsgHook(
        repo,
        [
          'echo "" >&2',
          'echo "COMMIT BLOCKED: These files are tracked by a spec\'s source manifest" >&2',
          'echo "but this commit has no Spec: trailer." >&2',
          "exit 1",
        ].join("\n"),
      );

      try {
        assert.throws(
          () => merge({ slug: "hook-reject", cwd: repo, noFf: true }),
          (e) => {
            assert.ok(e instanceof WorktreeError);
            assert.equal(e.code, "MERGE_FAILED");
            assert.notEqual(e.code, "MERGE_CONFLICT");
            // The real hook rejection text must be surfaced verbatim, not a
            // fabricated "conflicts on 0 file(s)" message.
            assert.match(e.message, /COMMIT BLOCKED/);
            assert.match(e.message, /Spec:\s*trailer/i);
            assert.doesNotMatch(e.message, /conflicts on 0 file/);
            // The hook-specific case (part c) should give actionable guidance.
            assert.match(e.message, /commit/i);
            return true;
          },
        );
      } finally {
        // Must run even if an assertion above fails, or the rejecting hook
        // stays installed and corrupts every later test's commits (hooks are
        // shared across worktrees of the same main repo).
        removeCommitMsgHook(repo);
      }

      // merge --abort must NOT have run: the merge is still staged/uncommitted.
      assert.ok(git(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], repo));
      const staged = git(["diff", "--cached", "--name-only"], repo);
      assert.match(staged, /hookfile\.txt/);

      // Clean up: abort the still-in-progress merge ourselves so later tests
      // in this file start from a clean tree.
      git(["merge", "--abort"], repo);
      remove({ slug: "hook-reject", cwd: repo, force: true, deleteBranch: true });
    });

    it("a non-hook, non-Spec commit-msg rejection still reports MERGE_FAILED with the generic actionable message (part a/b fallback)", () => {
      const a = add({ slug: "hook-reject-generic", cwd: repo });
      writeFileSync(join(a.path, "genericfile.txt"), "from-worktree\n");
      git(["add", "."], a.path);
      git(["commit", "-qm", "wt adds genericfile"], a.path);

      installRejectingCommitMsgHook(repo, ['echo "custom policy violation" >&2', "exit 1"].join("\n"));

      try {
        assert.throws(
          () => merge({ slug: "hook-reject-generic", cwd: repo, noFf: true }),
          (e) => {
            assert.ok(e instanceof WorktreeError);
            assert.equal(e.code, "MERGE_FAILED");
            assert.match(e.message, /custom policy violation/);
            // Must not claim this is the specific Spec:-trailer hook case.
            assert.doesNotMatch(e.message, /Spec:\s*trailer/i);
            // Must still say the tree is staged/uncommitted, not silently aborted.
            assert.match(e.message, /staged|uncommitted/i);
            return true;
          },
        );
      } finally {
        removeCommitMsgHook(repo);
      }

      const staged = git(["diff", "--cached", "--name-only"], repo);
      assert.match(staged, /genericfile\.txt/);

      git(["merge", "--abort"], repo);
      remove({ slug: "hook-reject-generic", cwd: repo, force: true, deleteBranch: true });
    });

    it("a merge that fails before any commit is attempted (nothing staged) reports MERGE_FAILED without claiming the tree is staged", () => {
      // Untracked file on main would be clobbered by the incoming merge —
      // git refuses before ever writing MERGE_HEAD or staging anything.
      const a = add({ slug: "precondition-fail", cwd: repo });
      writeFileSync(join(a.path, "blocked.txt"), "from-worktree\n");
      git(["add", "."], a.path);
      git(["commit", "-qm", "wt adds blocked.txt"], a.path);

      writeFileSync(join(repo, "blocked.txt"), "untracked-on-main\n");
      // deliberately left untracked (not `git add`ed) on main

      assert.throws(
        () => merge({ slug: "precondition-fail", cwd: repo }),
        (e) => {
          assert.ok(e instanceof WorktreeError);
          assert.equal(e.code, "MERGE_FAILED");
          assert.doesNotMatch(e.message, /conflicts on 0 file/);
          // Nothing was ever staged — must not claim a merge is staged/pending.
          assert.doesNotMatch(e.message, /the tree is staged and uncommitted/i);
          return true;
        },
      );

      assert.throws(() => git(["rev-parse", "--verify", "MERGE_HEAD"], repo));
      assert.equal(git(["diff", "--cached", "--name-only"], repo), "");

      // The untracked file git refused to clobber is still there, untouched.
      assert.ok(existsSync(join(repo, "blocked.txt")));
      rmSync(join(repo, "blocked.txt"), { force: true });
      remove({ slug: "precondition-fail", cwd: repo, force: true, deleteBranch: true });
    });
  });
});
