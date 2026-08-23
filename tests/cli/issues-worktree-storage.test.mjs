/**
 * Worktree-correctness for `adev issues` (BEH-1).
 *
 * This is the regression guard for the P2 data-loss failure: an epic that was
 * never created because the agent reached for `br` from a linked worktree. A
 * raw `br` call resolves `.beads/` from CWD, so inside a linked worktree it
 * opens the git-tracked `issues.jsonl` with no `beads.db` beside it and dies
 * with SYNC_CONFLICT — the write is simply lost. Every `adev issues` verb goes
 * through `getIssueManager()` instead, which resolves the storage root from
 * the git common dir (`lib/issues/resolve-root.mjs`), so a write issued from
 * any linked worktree lands on the MAIN checkout's board and a read from any
 * checkout returns that one board.
 *
 * INV-2: storage is obtained only via `getIssueManager()`. These tests never
 * re-derive the storage root themselves — they assert on the main checkout's
 * board path (which IS the storage root by construction of the fixture) and on
 * CLI output, never on `resolveStorageRoot()`'s internals.
 *
 * Covers:
 * - a create issued from a linked worktree mutates the main board and creates
 *   NO board file under the worktree (untracked-board fixture)
 * - `adev issues board` is byte-identical from both checkouts
 * - with the board git-tracked, the worktree's frozen checkout copy is left
 *   untouched while the real board is mutated, and a read from the worktree
 *   still reports the new item (it goes through the adapter, not the stale
 *   local copy)
 *
 * Hermetic: `git init` in a temp dir, no remote, no network, identity set
 * locally. There is deliberately no "skip when git worktree is unavailable"
 * branch — if `git worktree` cannot run, this suite must fail loudly.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDir, cleanupTempDir } from "../helpers.mjs";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

const BOARD_REL = join(".context-index", "tasks", "tasks.json");

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject() {
  const root = createTempDir();
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  git(root, ["init", "-q", "-b", "main", "."]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "t"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", ".context-index/manifest.yaml"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

/** Seed the board deterministically through the CLI and return the ids. */
function seedBoard(root) {
  const first = createItem(root, ["Seeded alpha", "--type", "task"]);
  const second = createItem(root, ["Seeded beta", "--type", "bug"]);
  return [first.id, second.id];
}

function createItem(cwd, args) {
  const r = runCli(cwd, ["create", ...args, "--json"]);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

function readBoard(root) {
  return JSON.parse(readFileSync(join(root, BOARD_REL), "utf8"));
}

describe("adev issues from a linked worktree (BEH-1)", () => {
  let root;
  let wt;
  let seededIds;
  let worktreeCreatedId;

  before(() => {
    root = makeProject();
    seededIds = seedBoard(root);
    // The board stays untracked here so "no board file under the worktree" is
    // an assertion about what adev wrote, not about what `git checkout`
    // materialised. The git-tracked variant is exercised separately below.
    git(root, ["worktree", "add", "-q", "-b", "side", "wt"]);
    wt = join(root, "wt");
  });

  after(() => {
    cleanupTempDir(root);
  });

  it("mutates the MAIN checkout's board, not a worktree-local one", () => {
    assert.equal(existsSync(join(wt, ".context-index", "manifest.yaml")), true,
      "fixture: the worktree checked out the manifest");
    assert.equal(existsSync(join(wt, BOARD_REL)), false,
      "fixture: the worktree starts with no board file");
    assert.equal(readBoard(root).issues.length, 2, "fixture: the main board holds the seed");

    const created = createItem(wt, ["from wt", "--type", "epic"]);
    worktreeCreatedId = created.id;

    const board = readBoard(root);
    const ids = board.issues.map((i) => i.id);
    assert.deepEqual(ids, [...seededIds, worktreeCreatedId],
      "the worktree create appended to the MAIN checkout's board");
    const landed = board.issues.find((i) => i.id === worktreeCreatedId);
    assert.equal(landed.title, "from wt");
    assert.equal(landed.type, "epic");

    // The failure this test exists to prevent: a worktree-local board.
    assert.equal(existsSync(join(wt, BOARD_REL)), false,
      `a board file was created inside the worktree at ${join(wt, BOARD_REL)} — ` +
      "the write did not resolve through the git common dir");
    assert.equal(existsSync(join(wt, ".context-index", "tasks")), false,
      `a storage directory was created inside the worktree at ${join(wt, ".context-index", "tasks")}`);
  });

  it("reads the same board from both checkouts", () => {
    const fromMain = runCli(root, ["board"]);
    const fromWorktree = runCli(wt, ["board"]);

    assert.equal(fromMain.status, 0, fromMain.stderr);
    assert.equal(fromWorktree.status, 0, fromWorktree.stderr);
    assert.equal(fromWorktree.stdout, fromMain.stdout,
      "`adev issues board` must render the same bytes from a linked worktree");

    // Guard against two identically-empty renders passing the comparison.
    for (const id of [...seededIds, worktreeCreatedId]) {
      assert.match(fromWorktree.stdout, new RegExp(id));
    }
    assert.match(fromWorktree.stdout, /Seeded alpha/);
    assert.match(fromWorktree.stdout, /from wt/);

    assert.equal(existsSync(join(wt, BOARD_REL)), false,
      "a read from the worktree must not materialise a worktree-local board");
  });
});

describe("adev issues with a git-tracked board in the worktree (BEH-1)", () => {
  let root;
  let wt;
  let frozenCopy;

  before(() => {
    root = makeProject();
    seedBoard(root);
    // The real repo commits its board, so `git worktree add` materialises a
    // frozen copy of tasks.json in the linked worktree (the issue-615 shadow
    // board). Writes must still reach the main checkout's copy, and reads from
    // the worktree must report the real board, not the frozen one.
    git(root, ["add", "-f", BOARD_REL]);
    git(root, ["commit", "-q", "-m", "board"]);
    git(root, ["worktree", "add", "-q", "-b", "shadow", "wt"]);
    wt = join(root, "wt");
    frozenCopy = readFileSync(join(wt, BOARD_REL), "utf8");
  });

  after(() => {
    cleanupTempDir(root);
  });

  it("writes past the worktree's frozen copy to the real board", () => {
    assert.notEqual(frozenCopy, "", "fixture: the worktree checked out a board copy");

    const created = createItem(wt, ["shadowed create", "--type", "task"]);

    const board = readBoard(root);
    assert.ok(board.issues.some((i) => i.id === created.id),
      "the create landed on the MAIN checkout's board");

    assert.equal(readFileSync(join(wt, BOARD_REL), "utf8"), frozenCopy,
      `the worktree-local board copy at ${join(wt, BOARD_REL)} was written to — ` +
      "the write did not resolve through the git common dir");

    // The read path must agree with the write path: the worktree reports the
    // new item even though its own checked-out copy predates it.
    const fromWorktree = runCli(wt, ["board"]);
    assert.equal(fromWorktree.status, 0, fromWorktree.stderr);
    assert.match(fromWorktree.stdout, new RegExp(created.id));
    assert.match(fromWorktree.stdout, /shadowed create/);
    assert.equal(fromWorktree.stdout, runCli(root, ["board"]).stdout);
  });
});
