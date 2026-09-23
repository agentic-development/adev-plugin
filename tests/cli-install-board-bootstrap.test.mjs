// tests/cli-install-board-bootstrap.test.mjs
//
// BEH-6: the CLI install/upgrade flow auto-provisions the .beads/ board
// worktree when `tasks.backend: beads` and a `beads-board` branch already
// exists on the remote.
//
// Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { maybeProvisionBoardWorktree } from "../cli/index.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/**
 * Build a bare `origin.git` that already has a `beads-board` branch, plus a
 * clone of it — the fixture shape a `git clone` of an already-migrated repo
 * would produce.
 */
function createCloneWithBoardBranch() {
  const bareDir = mkdtempSync(join(tmpdir(), "board-bootstrap-bare-"));
  git(["init", "--bare", "-q", "-b", "main"], bareDir);

  const seedDir = mkdtempSync(join(tmpdir(), "board-bootstrap-seed-"));
  git(["init", "-q", "-b", "main"], seedDir);
  git(["config", "user.email", "test@test.com"], seedDir);
  git(["config", "user.name", "Test"], seedDir);
  git(["config", "commit.gpgsign", "false"], seedDir);
  git(["commit", "--allow-empty", "-q", "-m", "init"], seedDir);
  git(["remote", "add", "origin", bareDir], seedDir);
  git(["push", "origin", "main"], seedDir);
  // beads-board: an orphan branch, seeded and pushed, matching what BEH-2's
  // precondition ("a beads-board branch already exists on the remote
  // origin") describes.
  git(["worktree", "add", "--orphan", "-b", "beads-board", ".beads-seed"], seedDir);
  git(["commit", "--allow-empty", "-q", "-m", "seed board"], join(seedDir, ".beads-seed"));
  git(["push", "origin", "beads-board"], join(seedDir, ".beads-seed"));

  const cloneDir = mkdtempSync(join(tmpdir(), "board-bootstrap-clone-"));
  git(["clone", "-q", bareDir, cloneDir]);
  git(["config", "user.email", "test@test.com"], cloneDir);
  git(["config", "user.name", "Test"], cloneDir);
  git(["config", "commit.gpgsign", "false"], cloneDir);

  rmSync(seedDir, { recursive: true, force: true });
  return { bareDir, cloneDir };
}

describe("maybeProvisionBoardWorktree", () => {
  let bareDir;
  let cloneDir;

  beforeEach(() => {
    ({ bareDir, cloneDir } = createCloneWithBoardBranch());
  });

  afterEach(() => {
    rmSync(bareDir, { recursive: true, force: true });
    rmSync(cloneDir, { recursive: true, force: true });
  });

  it("provisions .beads/ as a linked worktree on install when tasks.backend is beads and a beads-board branch exists on origin", async () => {
    await maybeProvisionBoardWorktree(cloneDir, { tasks: { backend: "beads" } });

    assert.ok(existsSync(join(cloneDir, ".beads")));
    const worktrees = git(["worktree", "list", "--porcelain"], cloneDir);
    assert.match(worktrees, /worktree .*\.beads/);
  });

  it("is a no-op when tasks.backend is not beads", async () => {
    await maybeProvisionBoardWorktree(cloneDir, { tasks: { backend: "file" } });
    assert.ok(!existsSync(join(cloneDir, ".beads")));
  });

  it("running install/upgrade a second time against an already-provisioned repo is a silent no-op (review finding)", async () => {
    await maybeProvisionBoardWorktree(cloneDir, { tasks: { backend: "beads" } });
    assert.ok(existsSync(join(cloneDir, ".beads")));

    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];
    const errs = [];
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => errs.push(args.join(" "));
    try {
      await maybeProvisionBoardWorktree(cloneDir, { tasks: { backend: "beads" } });
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    assert.ok(!errs.some((l) => l.startsWith("warn:")), `unexpected warn line: ${errs.join("\n")}`);
    assert.ok(existsSync(join(cloneDir, ".beads")));
  });
});
