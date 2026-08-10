// tests/cli/worktree.test.mjs
//
// CLI-contract tests for `adev worktree` (lib/cli/worktree.mjs): JSON on stdout,
// exit codes, usage on error, and the nesting guard.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..");
const CLI = resolve(PROJECT_ROOT, "cli", "index.mjs");

// NODE_OPTIONS in the harness may carry a stale --require preload; strip it so
// spawned `node` invocations don't inherit a broken loader.
const ENV = { ...process.env, NODE_OPTIONS: "" };

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function makeRepo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "adev-wt-cli-")));
  git(["init", "-q", "-b", "main"], dir);
  git(["config", "user.email", "t@t.co"], dir);
  git(["config", "user.name", "t"], dir);
  git(["config", "commit.gpgsign", "false"], dir);
  writeFileSync(join(dir, "f.txt"), "x\n");
  git(["add", "."], dir);
  git(["commit", "-qm", "init"], dir);
  return dir;
}

function run(dir, ...args) {
  return spawnSync("node", [CLI, "worktree", ...args], { encoding: "utf8", cwd: dir, env: ENV });
}

test("worktree with no subcommand exits 1 with usage", () => {
  const dir = makeRepo();
  try {
    const r = run(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr + r.stdout, /usage: adev worktree/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree list emits a JSON array (empty at start)", () => {
  const dir = makeRepo();
  try {
    const r = run(dir, "list");
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree guard reports not-nested JSON at repo root, exit 0", () => {
  const dir = makeRepo();
  try {
    const r = run(dir, "guard");
    assert.equal(r.status, 0);
    assert.deepEqual(JSON.parse(r.stdout), { nested: false, kind: null });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree add without --slug exits 1 with usage", () => {
  const dir = makeRepo();
  try {
    const r = run(dir, "add");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /requires --slug|usage/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree unknown subcommand exits 1", () => {
  const dir = makeRepo();
  try {
    const r = run(dir, "bogus");
    assert.equal(r.status, 1);
    assert.match(r.stderr + r.stdout, /unknown worktree subcommand/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree add then list round-trips valid JSON, exit 0", () => {
  const dir = makeRepo();
  try {
    const added = run(dir, "add", "--slug", "cli-a");
    assert.equal(added.status, 0);
    const rec = JSON.parse(added.stdout);
    assert.equal(rec.slug, "cli-a");
    assert.equal(rec.branch, "adev/cli-a");
    assert.equal(rec.created, true);

    const listed = JSON.parse(run(dir, "list").stdout);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].slug, "cli-a");

    const removed = run(dir, "remove", "--slug", "cli-a", "--force", "--delete-branch");
    assert.equal(removed.status, 0);
    assert.equal(JSON.parse(removed.stdout).removed, true);
    assert.deepEqual(JSON.parse(run(dir, "list").stdout), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree add with an invalid slug exits 1 (INVALID_SLUG)", () => {
  const dir = makeRepo();
  try {
    const r = run(dir, "add", "--slug", "../evil");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID_SLUG/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
