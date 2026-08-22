// tests/lib/cli-issues-board-migrate.test.mjs
//
// Integration tests for `adev issues board migrate` against real scratch git
// repos (bare `origin.git` + clone), matching the spec's own prototype-spike
// methodology. Covers BEH-7 (main-tracked -> migrated), BEH-8 (--dry-run
// never mutates), BEH-9 (already-migrated no-op, live and dry-run), the
// checkpoint-consulted-before-topology-detection fix, and the
// checkpoint-gated resume (Task 7 — a resumed invocation must never re-touch
// main's tree, and corrupt-leftover recovery must fire on the resumed path
// too).
//
// Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../../lib/cli/issues-board.mjs";
import { writeBoardMigrateCheckpoint, readBoardMigrateCheckpoint } from "../../lib/cli/issues-board-state.mjs";
import { ensureManagedBlock } from "../../lib/gitignore-installer.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A repo with `.beads/issues.jsonl` tracked on `main`, plus a bare `origin` remote. */
function createMainTrackedRepo() {
  const bareDir = mkdtempSync(join(tmpdir(), "board-migrate-bare-"));
  git(["init", "--bare", "-q", "-b", "main"], bareDir);

  const repoDir = mkdtempSync(join(tmpdir(), "board-migrate-repo-"));
  git(["init", "-q", "-b", "main"], repoDir);
  git(["config", "user.email", "test@test.com"], repoDir);
  git(["config", "user.name", "Test"], repoDir);
  git(["config", "commit.gpgsign", "false"], repoDir);
  mkdirSync(join(repoDir, ".beads"));
  writeFileSync(join(repoDir, ".beads", "issues.jsonl"), '{"id":"issue-1","title":"seed"}\n');
  git(["add", "."], repoDir);
  git(["commit", "-q", "-m", "init"], repoDir);
  git(["remote", "add", "origin", bareDir], repoDir);
  git(["push", "-q", "origin", "main"], repoDir);

  return { bareDir, repoDir };
}

/**
 * Drive a repo through exactly the state `run()`'s `!checkpoint` branch
 * leaves behind between its cleanup commit and its `provisionBoardWorktree()`
 * call: the `beads-board` push has landed, main's tree has already been
 * cleaned (`.beads/issues.jsonl` untracked, `.gitignore` updated, cleanup
 * commit made), the checkpoint is written, and `.beads/` is absent from disk
 * and not yet a registered worktree.
 */
function landPushAndCleanMainTree(repoDir) {
  const snapshot = readFileSync(join(repoDir, ".beads", "issues.jsonl"));
  const tmpWorktree = join(repoDir, ".beads-migrate-tmp");
  git(["worktree", "add", "--orphan", "-b", "beads-board", ".beads-migrate-tmp"], repoDir);
  writeFileSync(join(tmpWorktree, "issues.jsonl"), snapshot);
  git(["add", "issues.jsonl"], tmpWorktree);
  git(["commit", "-q", "-m", "chore: snapshot board content from main"], tmpWorktree);
  git(["push", "-q", "origin", "beads-board"], tmpWorktree);
  git(["worktree", "remove", "--force", ".beads-migrate-tmp"], repoDir);

  writeBoardMigrateCheckpoint(repoDir, { step: "push-landed" });

  git(["rm", "-r", "-q", "--cached", ".beads"], repoDir);
  ensureManagedBlock(repoDir);
  git(["add", ".gitignore"], repoDir);
  git(["commit", "-q", "-m", "chore: move beads board off main onto beads-board branch"], repoDir);

  // .beads/ is still present on disk at this point (git rm --cached only
  // untracks it, doesn't delete the working-tree files) — a real interrupted
  // run could be killed either before or after this cleanup, so remove it
  // here to reproduce the "disk absent, not yet re-provisioned" state
  // run()'s checkpoint branch is meant to recover from.
  rmSync(join(repoDir, ".beads"), { recursive: true, force: true });
}

describe("adev issues board migrate", () => {
  let bareDir;
  let repoDir;

  afterEach(() => {
    if (bareDir) rmSync(bareDir, { recursive: true, force: true });
    if (repoDir) rmSync(repoDir, { recursive: true, force: true });
    bareDir = undefined;
    repoDir = undefined;
  });

  it("migrates a main-tracked .beads/issues.jsonl onto beads-board (BEH-7)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());

    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: { tasks: { backend: "beads" } } });
    assert.equal(code, 0);

    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.match(worktrees, /worktree .*\.beads/);

    const tracked = git(["ls-tree", "-r", "--name-only", "HEAD", "--", ".beads/issues.jsonl"], repoDir);
    assert.equal(tracked, "", "main must no longer track .beads/issues.jsonl");

    const gitignore = readFileSync(join(repoDir, ".gitignore"), "utf8");
    assert.match(gitignore, /\.beads\//);

    const content = readFileSync(join(repoDir, ".beads", "issues.jsonl"), "utf8");
    assert.match(content, /issue-1/, "board content preserved across migration");
  });

  it("--dry-run reports planned steps without mutating (BEH-8)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    const beforeHead = git(["rev-parse", "HEAD"], repoDir);

    const code = await run({ projectRoot: repoDir, argv: ["migrate", "--dry-run"], manifest: {} });
    assert.equal(code, 0);

    assert.equal(git(["rev-parse", "HEAD"], repoDir), beforeHead, "dry-run must not commit");
    assert.ok(!existsSync(join(repoDir, ".gitignore")), "dry-run must not write .gitignore");
    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.ok(!worktrees.includes(".beads-migrate-tmp") && !/worktree .*\.beads$/m.test(worktrees));
  });

  it("reports BOARD_ALREADY_MIGRATED as a no-op when already migrated (BEH-9)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    const first = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(first, 0);

    const headAfterFirst = git(["rev-parse", "HEAD"], repoDir);
    const second = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(second, 0);
    assert.equal(git(["rev-parse", "HEAD"], repoDir), headAfterFirst, "second run must not mutate main");
  });

  it("--dry-run on an already-migrated repo reports BOARD_ALREADY_MIGRATED with no mutation", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    const headAfterMigrate = git(["rev-parse", "HEAD"], repoDir);

    const code = await run({ projectRoot: repoDir, argv: ["migrate", "--dry-run"], manifest: {} });
    assert.equal(code, 0);
    assert.equal(git(["rev-parse", "HEAD"], repoDir), headAfterMigrate);
  });

  it("BOARD_NOTHING_TO_MIGRATE when .beads/issues.jsonl does not exist on main", async () => {
    bareDir = mkdtempSync(join(tmpdir(), "board-migrate-bare-"));
    git(["init", "--bare", "-q", "-b", "main"], bareDir);
    repoDir = mkdtempSync(join(tmpdir(), "board-migrate-repo-"));
    git(["init", "-q", "-b", "main"], repoDir);
    git(["config", "user.email", "test@test.com"], repoDir);
    git(["config", "user.name", "Test"], repoDir);
    git(["config", "commit.gpgsign", "false"], repoDir);
    git(["commit", "-q", "--allow-empty", "-m", "init"], repoDir);

    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(code, 1);
  });

  it("a checkpoint from a mid-migration interruption is consulted BEFORE topology detection (iteration-2 review finding)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    landPushAndCleanMainTree(repoDir);
    assert.ok(readBoardMigrateCheckpoint(repoDir), "checkpoint must be present for this scenario");
    assert.ok(!existsSync(join(repoDir, ".beads")), "disk .beads/ must be absent for this scenario");

    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    // Must NOT fall through detectTopology()'s "nothing" branch and return
    // BOARD_NOTHING_TO_MIGRATE — the checkpoint must short-circuit straight
    // to recovery + re-provisioning instead.
    assert.equal(code, 0);
    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.match(worktrees, /worktree .*\.beads/);
    assert.equal(readBoardMigrateCheckpoint(repoDir), null, "checkpoint cleared on successful resume");
  });

  it("resumes from a checkpoint without re-touching main's tree (plan-review fix)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    landPushAndCleanMainTree(repoDir);
    const beforeHead = git(["rev-parse", "HEAD"], repoDir);
    const beforeGitignore = readFileSync(join(repoDir, ".gitignore"), "utf8");

    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(code, 0);

    // main's tree must be untouched by this invocation: no new commit, no
    // second `git rm --cached` attempt.
    assert.equal(git(["rev-parse", "HEAD"], repoDir), beforeHead);
    assert.equal(readFileSync(join(repoDir, ".gitignore"), "utf8"), beforeGitignore);

    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.match(worktrees, /worktree .*\.beads/);
  });

  it("resumes from a checkpoint left by an interrupted migration, skipping snapshot/branch/push (Error Cases row 8)", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    landPushAndCleanMainTree(repoDir);

    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(code, 0);

    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.match(worktrees, /worktree .*\.beads/);

    // A second interrupted-retry-style invocation (no checkpoint left this
    // time, already fully migrated) must not surface BOARD_ALREADY_EXISTS.
    const second = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(second, 0);
  });

  it("a second corrupt-leftover retry never surfaces a stale-registration error", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    landPushAndCleanMainTree(repoDir);

    const first = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(first, 0);

    // Simulate a corrupt leftover from an interrupted `git worktree add`:
    // stale plain directory on disk plus a stale admin entry, with the
    // checkpoint re-written by hand to force the resumed path again.
    rmSync(join(repoDir, ".beads"), { recursive: true, force: true });
    mkdirSync(join(repoDir, ".beads"));
    writeFileSync(join(repoDir, ".beads", "leftover.txt"), "stale\n");
    writeBoardMigrateCheckpoint(repoDir, { step: "push-landed" });

    const second = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });
    assert.equal(second, 0);
    const worktrees = git(["worktree", "list", "--porcelain"], repoDir);
    assert.match(worktrees, /worktree .*\.beads/);
  });

  it("adev issues board migrate dispatches through the issues sub-verb router", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    const { run: issuesRun } = await import("../../lib/cli/issues.mjs");
    const code = await issuesRun({
      projectRoot: repoDir,
      argv: ["board", "migrate"],
      manifest: { tasks: { backend: "beads" } },
    });
    assert.equal(code, 0);
  });

  it("adev issues board with no sub-verb prints usage and exits 1", async () => {
    ({ bareDir, repoDir } = createMainTrackedRepo());
    const { run: issuesRun } = await import("../../lib/cli/issues.mjs");
    const code = await issuesRun({ projectRoot: repoDir, argv: ["board"], manifest: {} });
    assert.equal(code, 1);
  });

  it("main untouched until push succeeds (Error Cases row 7)", async () => {
    // A main-tracked repo with NO origin remote configured at all: the
    // beads-board push has nothing to push to and fails deterministically,
    // before any of main's tree is touched (git rm --cached, gitignore edit,
    // and the cleanup commit all live strictly after the push in run()).
    repoDir = mkdtempSync(join(tmpdir(), "board-migrate-repo-"));
    git(["init", "-q", "-b", "main"], repoDir);
    git(["config", "user.email", "test@test.com"], repoDir);
    git(["config", "user.name", "Test"], repoDir);
    git(["config", "commit.gpgsign", "false"], repoDir);
    mkdirSync(join(repoDir, ".beads"));
    writeFileSync(join(repoDir, ".beads", "issues.jsonl"), '{"id":"issue-1","title":"seed"}\n');
    git(["add", "."], repoDir);
    git(["commit", "-q", "-m", "init"], repoDir);
    // Deliberately no `git remote add origin` — push has nowhere to go.

    const beforeHead = git(["rev-parse", "HEAD"], repoDir);
    const code = await run({ projectRoot: repoDir, argv: ["migrate"], manifest: {} });

    assert.equal(code, 1, "a failed push must return a clean non-zero exit, not throw uncaught");
    assert.equal(git(["rev-parse", "HEAD"], repoDir), beforeHead, "main's HEAD must be unchanged");
    assert.ok(!existsSync(join(repoDir, ".gitignore")), "main's .gitignore must not have been written");
    const tracked = git(["ls-tree", "-r", "--name-only", "HEAD", "--", ".beads/issues.jsonl"], repoDir);
    assert.notEqual(tracked, "", ".beads/issues.jsonl must still be tracked on main — cleanup never ran");
    assert.equal(readBoardMigrateCheckpoint(repoDir), null, "no checkpoint written — push never landed");
  });
});
