/**
 * Tests for `adev issues epic`.
 *
 * Why this verb is separate from `adev issues create --type epic`: `create()`
 * lands every item in `board.issues`, and `validateIssue`'s fixed whitelist
 * drops `milestone` outright. `createEpic()` is the ONLY path that reaches
 * `board.epics`, which is in turn the only store `listEpics()` reads — so
 * `adev issues board`, `adev issues list --milestone` and `adev issues update
 * --milestone` cannot see an "epic" minted through `create({type:"epic"})`.
 * These tests pin that boundary from the outside.
 *
 * Covers:
 * - the epic lands in `board.epics`, never `board.issues`
 * - --milestone is persisted and is visible to `adev issues list --milestone`
 * - omitting --milestone creates an epic that carries none
 * - --plan-ref is persisted on the epic record, so `/adev:implement`'s "load
 *   the epic matching this plan's planRef" and `/adev:reconcile` pass 1e can
 *   find it instead of minting a duplicate on every run
 * - omitting --plan-ref creates an epic that carries none
 * - --json emits the full epic record
 * - a missing title is exit 1 with the usage line
 * - --help prints THIS verb's usage, not the parent subcommand list
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

function runIssues(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

function runCli(cwd, args) {
  return runIssues(cwd, ["epic", ...args]);
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "adev-issues-epic-"));
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

describe("adev issues epic", () => {
  let root;

  before(() => {
    root = makeProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("lands the epic in board.epics, never board.issues", () => {
    const r = runCli(root, ["Epic store surface"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created epic epic-\w+: Epic store surface$/m);

    const board = readBoard(root);
    const found = board.epics.find((e) => e.title === "Epic store surface");
    assert.ok(found, "epic landed in board.epics");
    assert.equal(found.status, "open");
    assert.equal(
      board.issues.find((i) => i.title === "Epic store surface"),
      undefined,
      "an epic must not be duplicated into board.issues"
    );
  });

  it("persists --milestone on the epic record", () => {
    const r = runCli(root, ["Milestone carrier", "--milestone", "v9"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created epic epic-\w+: Milestone carrier$/m);
    assert.match(r.stdout, /^ {2}milestone: v9$/m);

    const found = readBoard(root).epics.find((e) => e.title === "Milestone carrier");
    assert.equal(found.milestone, "v9");
  });

  it("exposes the milestone to `adev issues list --milestone`", () => {
    const created = runCli(root, ["Listable milestone epic", "--milestone", "v10", "--json"]);
    assert.equal(created.status, 0, created.stderr);
    const epicId = JSON.parse(created.stdout).id;

    const child = runIssues(root, ["create", "Child under v10", "--epic", epicId]);
    assert.equal(child.status, 0, child.stderr);

    const listed = runIssues(root, ["list", "--milestone", "v10"]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /Child under v10/);

    // A milestone no epic carries is reported as such, which is the proof the
    // filter reads the epic store this verb wrote to.
    const empty = runIssues(root, ["list", "--milestone", "v10-nonexistent"]);
    assert.equal(empty.status, 0, empty.stderr);
    assert.match(empty.stdout, /No epics found for milestone 'v10-nonexistent'\./);
  });

  it("creates an epic with no milestone when the flag is omitted", () => {
    const r = runCli(root, ["No milestone here", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).milestone, undefined);
    assert.doesNotMatch(r.stdout, /milestone": "/);

    const found = readBoard(root).epics.find((e) => e.title === "No milestone here");
    assert.equal(found.milestone, undefined);
  });

  it("--json emits the full epic record", () => {
    const r = runCli(root, ["Json shaped epic", "--milestone", "v11", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.title, "Json shaped epic");
    assert.equal(parsed.status, "open");
    assert.equal(parsed.milestone, "v11");
    assert.match(parsed.id, /^epic-/);
  });

  it("persists --plan-ref on the epic record in board.epics", () => {
    const r = runCli(root, [
      "Plan ref carrier",
      "--plan-ref",
      ".context-index/specs/features/task-management/backend-migration.plan.md",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created epic epic-\w+: Plan ref carrier$/m);
    assert.match(
      r.stdout,
      /^ {2}plan: \.context-index\/specs\/features\/task-management\/backend-migration\.plan\.md$/m
    );

    const board = readBoard(root);
    const found = board.epics.find((e) => e.title === "Plan ref carrier");
    assert.ok(found, "epic landed in board.epics");
    assert.equal(
      found.planRef,
      ".context-index/specs/features/task-management/backend-migration.plan.md"
    );
    assert.equal(
      board.issues.find((i) => i.title === "Plan ref carrier"),
      undefined,
      "an epic must not be duplicated into board.issues"
    );
  });

  it("exposes --plan-ref through --json", () => {
    const r = runCli(root, [
      "Json plan ref epic",
      "--plan-ref",
      ".context-index/specs/features/cli-driver-surface/epic-plan-ref.plan.md",
      "--json",
    ]);
    assert.equal(r.status, 0, r.stderr);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.title, "Json plan ref epic");
    assert.equal(
      parsed.planRef,
      ".context-index/specs/features/cli-driver-surface/epic-plan-ref.plan.md"
    );
    assert.match(parsed.id, /^epic-/);
  });

  it("creates an epic with no planRef when --plan-ref is omitted", () => {
    const r = runCli(root, ["No plan ref here", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).planRef, undefined);
    assert.doesNotMatch(r.stdout, /planRef/);

    const found = readBoard(root).epics.find((e) => e.title === "No plan ref here");
    assert.equal(found.planRef, undefined);
  });

  it("rejects a missing title with the usage line", () => {
    const r = runCli(root, []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a title is required/);
    assert.match(r.stderr, /^usage: adev issues epic/m);
  });

  it("rejects extra positionals rather than joining them", () => {
    const r = runCli(root, ["two", "words"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /expected exactly one title/);
  });

  it("--help prints this verb's usage, not the parent subcommand list", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^usage: adev issues epic/m);
    assert.doesNotMatch(r.stdout, /^Subcommands:$/m);
  });

  it("documents --plan-ref in the usage line and help body", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^usage: adev issues epic .*--plan-ref <path>/m);
    assert.match(r.stdout, /^--plan-ref <path>/m);
  });

  it("does NOT silently mint an epic titled 'list' — 'epic list' enumerates instead", () => {
    // Regression for issue-y49odg: `adev issues epic list` used to hit the
    // create path with "list" as a positional title (every other read-intent
    // `adev issues` sub-verb is named for reading, so an agent reasonably
    // expects this to enumerate). It exited 0 and minted a real epic.
    const before = readBoard(root).epics.length;

    const r = runCli(root, ["list"]);
    assert.equal(r.status, 0, r.stderr);

    const after = readBoard(root);
    assert.equal(after.epics.length, before, "no epic titled 'list' was created");
    assert.equal(
      after.epics.find((e) => e.title === "list"),
      undefined,
      "no epic titled 'list' exists in board.epics"
    );
    assert.doesNotMatch(r.stdout, /^Created epic /m);
  });

  it("'epic list' enumerates the epic store, not the issue store", () => {
    const seed = runCli(root, ["Enumerable epic one", "--milestone", "v42"]);
    assert.equal(seed.status, 0, seed.stderr);

    const r = runCli(root, ["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Enumerable epic one/);
    assert.match(r.stdout, /\[v42\]/);
  });

  it("'epic list --milestone' filters and 'epic list --json' emits the array", () => {
    const a = runCli(root, ["Milestone filter epic A", "--milestone", "v43", "--json"]);
    assert.equal(a.status, 0, a.stderr);
    const idA = JSON.parse(a.stdout).id;
    const b = runCli(root, ["Milestone filter epic B", "--milestone", "v44"]);
    assert.equal(b.status, 0, b.stderr);

    const filtered = runCli(root, ["list", "--milestone", "v43", "--json"]);
    assert.equal(filtered.status, 0, filtered.stderr);
    const parsed = JSON.parse(filtered.stdout);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.some((e) => e.id === idA));
    assert.ok(!parsed.some((e) => e.title === "Milestone filter epic B"));
  });

  it("'epic list' with no epics prints a clear empty message, not a silent no-op", () => {
    const emptyRoot = makeProject();
    try {
      const r = runIssues(emptyRoot, ["epic", "list"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /No epics found\./);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("the documented call shape 'epic \"<title>\" --plan-ref <path>' keeps working unchanged", () => {
    // /adev:plan and /adev:implement call this exact shape non-interactively.
    // It must keep exiting 0, printing the created line, and persisting to
    // board.epics with planRef set — completely unaffected by the 'list'
    // reservation, since "title" here is never literally "list".
    const r = runCli(root, [
      "Unattended plan epic",
      "--plan-ref",
      ".context-index/specs/features/task-management/regression-check.plan.md",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Created epic epic-\w+: Unattended plan epic$/m);
    assert.match(
      r.stdout,
      /^ {2}plan: \.context-index\/specs\/features\/task-management\/regression-check\.plan\.md$/m
    );

    const found = readBoard(root).epics.find((e) => e.title === "Unattended plan epic");
    assert.ok(found, "epic landed in board.epics");
    assert.equal(
      found.planRef,
      ".context-index/specs/features/task-management/regression-check.plan.md"
    );
  });
});
