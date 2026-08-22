// tests/lib/board-worktree.test.mjs
//
// Coverage for lib/issues/board-worktree.mjs: the orphan-branch-vs-existing-
// branch bootstrap decision (BEH-2/BEH-3), the BOARD_ALREADY_EXISTS error
// case, idempotency on an already-provisioned .beads/, and the
// recoverBeforeAdd delete-then-prune recovery sequence in isolation.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  provisionBoardWorktree,
  recoverBeforeAdd,
  BoardWorktreeError,
} from "../../lib/issues/board-worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

describe("provisionBoardWorktree", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "board-wt-"));
    git(["init", "-q", "-b", "main"], repo);
    git(["config", "user.email", "test@test.com"], repo);
    git(["config", "user.name", "Test"], repo);
    git(["config", "commit.gpgsign", "false"], repo);
    git(["commit", "--allow-empty", "-q", "-m", "init"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("creates an orphan beads-board branch when none exists (BEH-3)", () => {
    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "orphan");
    assert.equal(result.created, true);
    // The orphan branch is unborn (no commit yet), so it will not appear in
    // `git branch --list` until it gets a first commit — but the linked
    // worktree's HEAD is already symbolically pointed at it.
    const symbolicRef = git(["symbolic-ref", "HEAD"], join(repo, ".beads"));
    assert.equal(symbolicRef, "refs/heads/beads-board");
    assert.ok(existsSync(join(repo, ".beads")));
  });

  it("uses the existing local beads-board branch when one is already present (BEH-2)", () => {
    git(["worktree", "add", "-q", "--orphan", "-b", "beads-board", ".beads-tmp"], repo);
    // Give the branch a real commit so its ref survives worktree removal —
    // an orphan branch with zero commits is unborn and has no ref of its
    // own; it only exists as the temp worktree's symbolic HEAD.
    git(["commit", "-q", "--allow-empty", "-m", "seed board"], join(repo, ".beads-tmp"));
    git(["worktree", "remove", "--force", ".beads-tmp"], repo);

    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "existing-branch");
    assert.equal(result.created, true);
    assert.ok(existsSync(join(repo, ".beads")));
  });

  it("uses an existing remote-tracking beads-board branch when one is already present (BEH-2)", () => {
    // Set up a bare "origin" with a beads-board branch, then fetch it into
    // repo as a remote-tracking ref only (no local branch).
    const bareDir = mkdtempSync(join(tmpdir(), "board-wt-origin-"));
    git(["init", "-q", "--bare", "-b", "main"], bareDir);

    const seedDir = mkdtempSync(join(tmpdir(), "board-wt-seed-"));
    git(["clone", "-q", bareDir, seedDir], tmpdir());
    git(["config", "user.email", "test@test.com"], seedDir);
    git(["config", "user.name", "Test"], seedDir);
    git(["config", "commit.gpgsign", "false"], seedDir);
    git(["checkout", "-q", "--orphan", "beads-board"], seedDir);
    git(["commit", "-q", "--allow-empty", "-m", "seed board"], seedDir);
    git(["push", "-q", "origin", "beads-board"], seedDir);
    rmSync(seedDir, { recursive: true, force: true });

    git(["remote", "add", "origin", bareDir], repo);
    git(["fetch", "-q", "origin"], repo);

    // No local beads-board branch should exist yet — only the remote-tracking ref.
    let hasLocal = true;
    try {
      git(["rev-parse", "--verify", "--quiet", "refs/heads/beads-board"], repo);
    } catch {
      hasLocal = false;
    }
    assert.equal(hasLocal, false);

    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "existing-branch");
    assert.equal(result.created, true);

    rmSync(bareDir, { recursive: true, force: true });
  });

  it("throws BOARD_ALREADY_EXISTS when .beads/ is a non-empty plain directory", () => {
    mkdirSync(join(repo, ".beads"));
    writeFileSync(join(repo, ".beads", "issues.json"), "{}\n");

    assert.throws(
      () => provisionBoardWorktree({ projectRoot: repo }),
      (err) => {
        assert.ok(err instanceof BoardWorktreeError);
        assert.equal(err.code, "BOARD_ALREADY_EXISTS");
        assert.match(err.message, /adev issues board migrate/);
        return true;
      },
    );
  });

  it("wraps an orphan-branch git worktree add failure as BoardWorktreeError BOARD_ADD_FAILED (cq-1)", () => {
    // A plain, non-git directory has neither a local nor remote beads-board
    // ref (refExists catches and returns false for both), so
    // provisionBoardWorktree falls through to the orphan-branch path — where
    // `git worktree add --orphan -b beads-board .beads` is guaranteed to
    // fail deterministically because there is no git repository at all.
    const notARepo = mkdtempSync(join(tmpdir(), "board-wt-not-a-repo-"));
    try {
      assert.throws(
        () => provisionBoardWorktree({ projectRoot: notARepo }),
        (err) => {
          assert.ok(err instanceof BoardWorktreeError);
          assert.equal(err.code, "BOARD_ADD_FAILED");
          assert.match(err.message, /worktree add --orphan/);
          return true;
        },
      );
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });

  it("does not throw when .beads/ is a plain but empty directory (falls through to provisioning)", () => {
    mkdirSync(join(repo, ".beads"));
    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "orphan");
    assert.equal(result.created, true);
  });

  it("is idempotent: re-running against an already-provisioned .beads/ returns already-provisioned instead of failing (review finding)", () => {
    const first = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(first.created, true);

    const second = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(second.mode, "already-provisioned");
    assert.equal(second.created, false);
  });
});

describe("recoverBeforeAdd", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "board-wt-recover-"));
    git(["init", "-q", "-b", "main"], repo);
    git(["config", "user.email", "test@test.com"], repo);
    git(["config", "user.name", "Test"], repo);
    git(["config", "commit.gpgsign", "false"], repo);
    git(["commit", "--allow-empty", "-q", "-m", "init"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("does nothing when .beads/ does not exist on disk", () => {
    assert.equal(existsSync(join(repo, ".beads")), false);
    assert.doesNotThrow(() => recoverBeforeAdd({ projectRoot: repo }));
    assert.equal(existsSync(join(repo, ".beads")), false);
  });

  it("deletes a corrupt-leftover .beads/ directory from disk then prunes git worktree admin state", () => {
    // Simulate a corrupt leftover: a plain directory with content sitting at
    // .beads/, with no valid registration in `git worktree list`.
    mkdirSync(join(repo, ".beads"));
    writeFileSync(join(repo, ".beads", "stray-file.txt"), "leftover\n");
    assert.ok(existsSync(join(repo, ".beads")));

    recoverBeforeAdd({ projectRoot: repo });

    assert.equal(existsSync(join(repo, ".beads")), false);

    // After recovery, git worktree add for a fresh orphan branch must succeed
    // cleanly (proves prune did not leave a stale admin entry blocking reuse
    // of the .beads path).
    git(["worktree", "add", "-q", "--orphan", "-b", "beads-board", ".beads"], repo);
    assert.ok(existsSync(join(repo, ".beads")));
  });

  it("clears a stale .git/worktrees/.beads admin entry via prune, allowing re-add at the same path", () => {
    // Provision, then give the (initially unborn) orphan branch a real
    // commit so it has an actual ref — otherwise it vanishes entirely once
    // the worktree directory is removed, rather than leaving a reusable
    // branch behind. Then simulate an interrupted/corrupt state: the
    // worktree's working directory is deleted directly (not via
    // `git worktree remove`), leaving a stale administrative entry under
    // .git/worktrees/.beads that would block a naive
    // `git worktree add .beads ...` retry.
    provisionBoardWorktree({ projectRoot: repo });
    assert.ok(existsSync(join(repo, ".beads")));
    git(["commit", "-q", "--allow-empty", "-m", "seed board"], join(repo, ".beads"));

    rmSync(join(repo, ".beads"), { recursive: true, force: true });

    // Without prune, git may still refuse to re-add at the same path/branch
    // due to the stale admin entry. recoverBeforeAdd must clear it.
    recoverBeforeAdd({ projectRoot: repo });

    assert.doesNotThrow(() => {
      git(["worktree", "add", "-q", ".beads", "beads-board"], repo);
    });
    assert.ok(existsSync(join(repo, ".beads")));
  });
});
