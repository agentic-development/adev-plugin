/**
 * Tests for `adev issues list` and `adev issues ready`.
 *
 * These two verbs exist so the `/adev:issues` §List and §Ready steps stop
 * asking the agent to re-derive the work itself. §Ready in particular carried
 * the whole unblocked-filter as prose ("call list({ status: 'open' }), then
 * filter out issues whose dependencies include any unclosed issues") — an
 * algorithm re-implemented from scratch on every invocation, with no test
 * behind it. It lives in `lib/cli/issues-list.mjs` now.
 *
 * Covers:
 * - ready excludes issues with an open blocker, includes them once closed
 * - ready never lists a non-open issue (in_progress / closed / deferred)
 * - a dangling dependency id is non-blocking and reported on stderr
 * - list applies --status / --epic / --milestone
 * - list sorts by priority ascending (0 first)
 * - the "No epics found for milestone '<name>'." message
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

describe("adev issues ready", () => {
  let root;
  let blockerId;
  let blockedId;
  let freeId;
  let inProgressId;
  let closedId;
  let deferredId;

  before(async () => {
    root = makeProject("adev-issues-ready-");
    const manager = getIssueManager(MANIFEST, root);

    blockerId = (await manager.create({ title: "Blocker", type: "task" })).id;
    blockedId = (await manager.create({ title: "Blocked", type: "task" })).id;
    await manager.addDependency(blockedId, blockerId);

    freeId = (await manager.create({ title: "Free", type: "task" })).id;

    inProgressId = (await manager.create({ title: "Running", type: "task" })).id;
    await manager.update(inProgressId, { status: "in_progress" });

    closedId = (await manager.create({ title: "Done", type: "task" })).id;
    await manager.close(closedId, "finished");

    deferredId = (await manager.create({ title: "Parked", type: "task" })).id;
    await manager.update(deferredId, { status: "deferred" });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("excludes an open issue whose dependency is still open", () => {
    const r = runCli(root, ["ready", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const ids = JSON.parse(r.stdout).map((i) => i.id);
    assert.ok(ids.includes(blockerId), "blocker itself is actionable");
    assert.ok(ids.includes(freeId), "unblocked issue is actionable");
    assert.equal(ids.includes(blockedId), false, "blocked issue must be excluded");
  });

  it("never lists a non-open issue", () => {
    const r = runCli(root, ["ready", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const ids = JSON.parse(r.stdout).map((i) => i.id);
    assert.equal(ids.includes(inProgressId), false);
    assert.equal(ids.includes(closedId), false);
    assert.equal(ids.includes(deferredId), false);
  });

  it("prints the actionable heading and the ids in the human form", () => {
    const r = runCli(root, ["ready"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^Actionable issues — open and unblocked\.$/m);
    assert.match(r.stdout, new RegExp(`\\b${freeId}\\b`));
    assert.doesNotMatch(r.stdout, new RegExp(`\\b${blockedId}\\b`));
  });

  it("includes it once the blocker is closed", async () => {
    const manager = getIssueManager(MANIFEST, root);
    await manager.close(blockerId, "done");

    const r = runCli(root, ["ready", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const ids = JSON.parse(r.stdout).map((i) => i.id);
    assert.ok(ids.includes(blockedId), "blocked issue becomes actionable");
    assert.equal(ids.includes(blockerId), false, "the closed blocker is gone");
  });
});

describe("adev issues ready — dangling dependency", () => {
  let root;
  let danglingId;

  before(async () => {
    root = makeProject("adev-issues-ready-dangling-");
    const manager = getIssueManager(MANIFEST, root);
    const issue = await manager.create({ title: "Points at nothing", type: "task" });
    danglingId = issue.id;
    await manager.update(danglingId, { dependencies: ["issue-does-not-exist"] });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("treats an unresolvable dependency as non-blocking and notes it on stderr", () => {
    const r = runCli(root, ["ready", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const ids = JSON.parse(r.stdout).map((i) => i.id);
    assert.ok(ids.includes(danglingId));
    assert.match(r.stderr, /issue-does-not-exist/);
  });
});

describe("adev issues list", () => {
  let root;
  let epicA;
  let epicB;
  let inEpicA;
  let inEpicB;
  let standalone;
  let closedInA;

  before(async () => {
    root = makeProject("adev-issues-list-");
    const manager = getIssueManager(MANIFEST, root);

    epicA = (await manager.createEpic({ title: "Track A", milestone: "v1" })).id;
    epicB = (await manager.createEpic({ title: "Track B", milestone: "v2" })).id;

    inEpicA = (await manager.create({ title: "A work", type: "task", epicId: epicA, priority: 3 }))
      .id;
    inEpicB = (await manager.create({ title: "B work", type: "task", epicId: epicB, priority: 1 }))
      .id;
    standalone = (await manager.create({ title: "Loose work", type: "bug", priority: 0 })).id;

    closedInA = (
      await manager.create({ title: "A done", type: "task", epicId: epicA, priority: 2 })
    ).id;
    await manager.close(closedInA, "finished");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("filters by --status, --epic and --milestone", () => {
    const byStatus = runCli(root, ["list", "--status", "closed", "--json"]);
    assert.equal(byStatus.status, 0, byStatus.stderr);
    assert.deepEqual(
      JSON.parse(byStatus.stdout).map((i) => i.id),
      [closedInA]
    );

    const byEpic = runCli(root, ["list", "--epic", epicA, "--json"]);
    assert.equal(byEpic.status, 0, byEpic.stderr);
    assert.deepEqual(
      JSON.parse(byEpic.stdout)
        .map((i) => i.id)
        .sort(),
      [inEpicA, closedInA].sort()
    );

    const byMilestone = runCli(root, ["list", "--milestone", "v2", "--json"]);
    assert.equal(byMilestone.status, 0, byMilestone.stderr);
    assert.deepEqual(
      JSON.parse(byMilestone.stdout).map((i) => i.id),
      [inEpicB]
    );
  });

  it("sorts by priority ascending (0 first)", () => {
    const r = runCli(root, ["list"]);
    assert.equal(r.status, 0, r.stderr);
    const posStandalone = r.stdout.indexOf(standalone);
    const posEpicB = r.stdout.indexOf(inEpicB);
    const posEpicA = r.stdout.indexOf(inEpicA);
    assert.ok(posStandalone > -1 && posEpicB > -1 && posEpicA > -1, r.stdout);
    assert.ok(posStandalone < posEpicB, "priority 0 before priority 1");
    assert.ok(posEpicB < posEpicA, "priority 1 before priority 3");
  });

  it("prints \"No epics found for milestone '<name>'\" when nothing matches", () => {
    const r = runCli(root, ["list", "--milestone", "v99"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^No epics found for milestone 'v99'\.$/m);
    assert.doesNotMatch(r.stdout, new RegExp(`\\b${standalone}\\b`));
  });

  it("rejects an unknown --status with exit 1", () => {
    const r = runCli(root, ["list", "--status", "bogus"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^usage: adev issues list/m);
  });
});

describe("adev issues list/ready help", () => {
  let root;

  before(() => {
    root = makeProject("adev-issues-list-help-");
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("routes --help to the sub-verb usage, not the parent subcommand list", () => {
    const list = runCli(root, ["list", "--help"]);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /^usage: adev issues list/m);
    assert.doesNotMatch(list.stdout, /^Subcommands:$/m);

    const ready = runCli(root, ["ready", "--help"]);
    assert.equal(ready.status, 0, ready.stderr);
    assert.match(ready.stdout, /^usage: adev issues ready/m);
    assert.doesNotMatch(ready.stdout, /^Subcommands:$/m);
  });

  it("lists both sub-verbs in the parent help", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\s+list\s+\S/m);
    assert.match(r.stdout, /^\s+ready\s+\S/m);
  });
});
