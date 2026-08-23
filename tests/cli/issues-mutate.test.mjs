/**
 * Tests for `adev issues update`, `adev issues close` and `adev issues dep`.
 *
 * These three verbs exist so the `/adev:issues` §Update, §Close and §Add
 * Dependency steps stop being lib directives. §Update was the worst of the
 * three: it told the agent to decide whether `<id>` names an issue or an epic
 * BY PREFIX (`issue-*` vs `epic-*`) and then to call `update()` or
 * `updateEpic()` itself — a branch that is wrong for any backend that does not
 * mint prefixed ids, and that has no test behind it. The branch lives in
 * `lib/cli/issues-mutate.mjs` now, resolved by lookup.
 *
 * Exit-code discipline is the load-bearing contract here (INV-5):
 *   0  the mutation landed
 *   1  usage error or adapter failure (an unknown id is a 1, never a 2)
 *   2  refused by a guard (close guard, cycle detection)
 *
 * Covers:
 * - close refuses with exit 2 and names EVERY blocker, board unchanged (BEH-4)
 * - close on an unknown id is exit 1, not 2 (INV-5)
 * - close refuses a tiered parent with an unclosed child with exit 2
 * - close without --reason is a usage error
 * - dep refuses a cycle with exit 2 and reports it, board unchanged (BEH-5)
 * - dep adds a legal dependency with exit 0
 * - update resolves epic-vs-issue by lookup, from the id alone (BEH-6)
 * - update accepts --status and --milestone in one call
 * - update rejects --milestone on an issue id (epic-level field) with exit 1
 * - update redirects `--status closed` to the close verb (exit 1)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { getIssueManager } from "../../lib/issues/registry.mjs";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));
const MANIFEST = { tasks: { backend: "json" } };

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  execFileSync("git", ["init", "-q", "."], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  return root;
}

describe("adev issues close", () => {
  let root;
  let blockerOne;
  let blockerTwo;
  let blocked;

  before(async () => {
    root = makeProject("adev-issues-close-");
    const manager = getIssueManager(MANIFEST, root);

    blockerOne = (await manager.create({ title: "First blocker", type: "task" })).id;
    blockerTwo = (await manager.create({ title: "Second blocker", type: "task" })).id;
    blocked = (await manager.create({ title: "Blocked work", type: "task" })).id;
    await manager.addDependency(blocked, blockerOne);
    await manager.addDependency(blocked, blockerTwo);
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses with exit 2 and names every blocker (BEH-4)", async () => {
    const r = runCli(root, ["close", blocked, "--reason", "done"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, new RegExp(`\\b${blockerOne}\\b`));
    assert.match(r.stderr, new RegExp(`\\b${blockerTwo}\\b`));

    // The board must be untouched by a refused close.
    const manager = getIssueManager(MANIFEST, root);
    const stillOpen = await manager.get(blocked);
    assert.equal(stillOpen.status, "open");
  });

  it("exits 1, not 2, on an unknown id", () => {
    const r = runCli(root, ["close", "issue-does-not-exist", "--reason", "done"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /issue-does-not-exist/);
    assert.match(r.stderr, /not found/i);
  });

  it("requires --reason", async () => {
    const r = runCli(root, ["close", blockerOne]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^usage: adev issues close <id>/m);

    const manager = getIssueManager(MANIFEST, root);
    const untouched = await manager.get(blockerOne);
    assert.equal(untouched.status, "open");
  });

  it("closes an unblocked issue with exit 0", async () => {
    const r = runCli(root, ["close", blockerOne, "--reason", "finished"]);
    assert.equal(r.status, 0, r.stderr);

    const manager = getIssueManager(MANIFEST, root);
    const closed = await manager.get(blockerOne);
    assert.equal(closed.status, "closed");
  });
});

describe("adev issues close — cascade guard", () => {
  let root;
  let parentId;
  let childId;

  before(async () => {
    root = makeProject("adev-issues-close-cascade-");
    const manager = getIssueManager(MANIFEST, root);

    // Tiered ids ("e1" / "e1.f1") — the cascade guard only applies to those.
    parentId = (await manager.create({ title: "Parent", tier_prefix: "e" })).id;
    childId = (await manager.create({ title: "Child", parent_id: parentId })).id;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a parent with an unclosed child with exit 2", async () => {
    const r = runCli(root, ["close", parentId, "--reason", "done"]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, new RegExp(`\\b${childId.replace(".", "\\.")}\\b`));

    const manager = getIssueManager(MANIFEST, root);
    assert.equal((await manager.get(parentId)).status, "open");
  });
});

describe("adev issues dep", () => {
  let root;
  let first;
  let second;
  let free;
  let target;

  before(async () => {
    root = makeProject("adev-issues-dep-");
    const manager = getIssueManager(MANIFEST, root);

    first = (await manager.create({ title: "First", type: "task" })).id;
    second = (await manager.create({ title: "Second", type: "task" })).id;
    await manager.addDependency(first, second);

    free = (await manager.create({ title: "Free", type: "task" })).id;
    target = (await manager.create({ title: "Target", type: "task" })).id;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a cycle with exit 2 and reports it (BEH-5)", async () => {
    // `first` already depends on `second`; making `second` depend on `first`
    // closes the loop.
    const r = runCli(root, ["dep", second, first]);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /[Cc]ircular/);
    assert.match(r.stderr, new RegExp(`\\b${second}\\b`));
    assert.match(r.stderr, new RegExp(`\\b${first}\\b`));

    const manager = getIssueManager(MANIFEST, root);
    const unchanged = await manager.get(second);
    assert.deepEqual(unchanged.dependencies, []);
  });

  it("adds a legal dependency with exit 0", async () => {
    const r = runCli(root, ["dep", target, free]);
    assert.equal(r.status, 0, r.stderr);

    const manager = getIssueManager(MANIFEST, root);
    const updated = await manager.get(target);
    assert.deepEqual(updated.dependencies, [free]);
  });

  it("exits 1 on an unknown id", () => {
    const r = runCli(root, ["dep", "issue-does-not-exist", free]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /issue-does-not-exist/);
    assert.match(r.stderr, /not found/i);
  });

  it("prints its own usage when the second id is missing", () => {
    const r = runCli(root, ["dep", target]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^usage: adev issues dep <id>/m);
  });
});

describe("adev issues update", () => {
  let root;
  let issueId;
  let epicId;
  let closedTargetId;

  before(async () => {
    root = makeProject("adev-issues-update-");
    const manager = getIssueManager(MANIFEST, root);

    epicId = (await manager.createEpic({ title: "Track", milestone: "v1" })).id;
    issueId = (await manager.create({ title: "Work", type: "task", epicId })).id;
    closedTargetId = (await manager.create({ title: "Other work", type: "task" })).id;
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("updates an epic given an epic id and an issue given an issue id (BEH-6)", async () => {
    // The caller passes only the id — no --epic flag, no prefix branch at the
    // call site. The verb resolves which store the id lives in.
    const onIssue = runCli(root, ["update", issueId, "--status", "in_progress"]);
    assert.equal(onIssue.status, 0, onIssue.stderr);

    const onEpic = runCli(root, ["update", epicId, "--status", "in_progress"]);
    assert.equal(onEpic.status, 0, onEpic.stderr);

    const manager = getIssueManager(MANIFEST, root);
    assert.equal((await manager.get(issueId)).status, "in_progress");
    const epic = (await manager.listEpics()).find((e) => e.id === epicId);
    assert.equal(epic.status, "in_progress");
  });

  it("accepts --status and --milestone together in one call", async () => {
    const r = runCli(root, ["update", epicId, "--status", "deferred", "--milestone", "v2"]);
    assert.equal(r.status, 0, r.stderr);

    const manager = getIssueManager(MANIFEST, root);
    const epic = (await manager.listEpics()).find((e) => e.id === epicId);
    assert.equal(epic.status, "deferred");
    assert.equal(epic.milestone, "v2");
  });

  it("rejects --milestone on an issue id with exit 1", async () => {
    const r = runCli(root, ["update", issueId, "--milestone", "v3"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /milestone/);
    assert.match(r.stderr, /epic/i);

    const manager = getIssueManager(MANIFEST, root);
    const issue = await manager.get(issueId);
    assert.equal(issue.milestone, undefined);
  });

  it("directs the user to `close` when --status closed is attempted", async () => {
    const r = runCli(root, ["update", closedTargetId, "--status", "closed"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /adev issues close/);

    const manager = getIssueManager(MANIFEST, root);
    assert.equal((await manager.get(closedTargetId)).status, "open");
  });

  it("exits 1 when the id names neither an issue nor an epic", () => {
    const r = runCli(root, ["update", "issue-does-not-exist", "--status", "in_progress"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /issue-does-not-exist/);
    assert.match(r.stderr, /not found/i);
  });
});

describe("adev issues update/close/dep help", () => {
  let root;

  before(() => {
    root = makeProject("adev-issues-mutate-help-");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("routes --help to each sub-verb usage, not the parent subcommand list", () => {
    const update = runCli(root, ["update", "--help"]);
    assert.equal(update.status, 0, update.stderr);
    assert.match(update.stdout, /^usage: adev issues update <id>/m);
    assert.doesNotMatch(update.stdout, /^Subcommands:$/m);

    const close = runCli(root, ["close", "--help"]);
    assert.equal(close.status, 0, close.stderr);
    assert.match(close.stdout, /^usage: adev issues close <id>/m);
    assert.doesNotMatch(close.stdout, /^Subcommands:$/m);

    const dep = runCli(root, ["dep", "--help"]);
    assert.equal(dep.status, 0, dep.stderr);
    assert.match(dep.stdout, /^usage: adev issues dep <id>/m);
    assert.doesNotMatch(dep.stdout, /^Subcommands:$/m);
  });

  it("lists all three sub-verbs in the parent help", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\s+update\s+\S/m);
    assert.match(r.stdout, /^\s+close\s+\S/m);
    assert.match(r.stdout, /^\s+dep\s+\S/m);
  });
});
