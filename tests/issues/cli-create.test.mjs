/**
 * Tests for `adev issues create`.
 *
 * The verb exists so skills never shell out to the backend binary: a raw
 * `br create` resolves `.beads/` from CWD, and a linked worktree carries a
 * git-tracked `issues.jsonl` with no `beads.db` beside it, so the call dies
 * with SYNC_CONFLICT. Going through the adapter resolves the storage root via
 * the git common dir instead, which is the behavior the worktree test below
 * pins.
 *
 * Covers:
 * - creates a board item and prints `Created <type> <id>: <title>`
 * - --type / --priority / --plan-ref / --spec-ref / --notes round-trip
 * - --json emits the full record
 * - missing title, extra positionals, and out-of-range --priority exit 1
 * - a create issued from a linked worktree writes to the MAIN repo's board
 * - --epic records the parent epic on the created issue
 * - --milestone is refused here and names `adev issues epic` instead
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", "create", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "adev-issues-create-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  execFileSync("git", ["init", "-q", "."], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  return root;
}

function readBoard(root) {
  return JSON.parse(readFileSync(join(root, ".context-index", "tasks", "tasks.json"), "utf8"));
}

describe("adev issues create", () => {
  let root;

  before(() => {
    root = makeProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates an item and reports the minted id", () => {
    const r = runCli(root, ["Ship the thing"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created task issue-\w+: Ship the thing$/m);

    const board = readBoard(root);
    const found = board.issues.find((i) => i.title === "Ship the thing");
    assert.ok(found, "issue landed on the board");
    assert.equal(found.type, "task");
    assert.equal(found.priority, 2);
  });

  it("round-trips type, priority, plan/spec refs and notes", () => {
    const r = runCli(root, [
      "Graduated review depth",
      "--type", "epic",
      "--priority", "1",
      "--plan-ref", "specs/x.plan.md",
      "--spec-ref", "specs/x.spec.md",
      "--notes", "body text",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created epic issue-\w+: Graduated review depth$/m);
    assert.match(r.stdout, /plan: specs\/x\.plan\.md/);
    assert.match(r.stdout, /spec: specs\/x\.spec\.md/);

    const found = readBoard(root).issues.find((i) => i.title === "Graduated review depth");
    assert.equal(found.type, "epic");
    assert.equal(found.priority, 1);
    assert.equal(found.planRef, "specs/x.plan.md");
    assert.equal(found.spec_ref, "specs/x.spec.md");
    assert.equal(found.notes, "body text");
  });

  it("--json emits the full record", () => {
    const r = runCli(root, ["Json shaped", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.title, "Json shaped");
    assert.equal(parsed.status, "open");
    assert.match(parsed.id, /^issue-/);
  });

  it("rejects a missing title", () => {
    const r = runCli(root, []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a title is required/);
  });

  it("rejects extra positionals rather than joining them", () => {
    const r = runCli(root, ["two", "words"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /expected exactly one title/);
  });

  it("rejects an out-of-range priority", () => {
    const r = runCli(root, ["Bad priority", "--priority", "9"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /invalid --priority: 9/);
  });

  it("writes to the main repo's board when run from a linked worktree", () => {
    const wt = join(root, "wt");
    execFileSync("git", ["worktree", "add", "-q", "-b", "side", wt], { cwd: root });

    const r = runCli(wt, ["From a worktree", "--type", "epic"]);
    assert.equal(r.status, 0, r.stderr);

    // The board that matters is the MAIN checkout's — this is the whole point
    // of routing through the adapter instead of the backend binary.
    const found = readBoard(root).issues.find((i) => i.title === "From a worktree");
    assert.ok(found, "worktree create landed on the main repo board");
    assert.equal(found.type, "epic");

    execFileSync("git", ["worktree", "remove", "--force", wt], { cwd: root });
  });

  it("--epic records the parent epic on the created issue", () => {
    const r = runCli(root, ["Child of an epic", "--epic", "epic-7"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created task issue-\w+: Child of an epic$/m);

    const found = readBoard(root).issues.find((i) => i.title === "Child of an epic");
    assert.ok(found, "issue landed on the board");
    assert.equal(found.epicId, "epic-7");
  });

  it("refuses --milestone and names the verb that owns it", () => {
    const r = runCli(root, ["Wants a milestone", "--milestone", "v9"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /milestone is an epic-level field/);
    assert.match(r.stderr, /adev issues epic/);

    // Refused means refused: nothing may reach the board.
    assert.equal(
      readBoard(root).issues.find((i) => i.title === "Wants a milestone"),
      undefined
    );
  });

  it("leaves epicId unset when --epic is omitted", () => {
    const r = runCli(root, ["No epic of its own", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).epicId, undefined);

    const found = readBoard(root).issues.find((i) => i.title === "No epic of its own");
    assert.equal(found.epicId, undefined);
  });
});
