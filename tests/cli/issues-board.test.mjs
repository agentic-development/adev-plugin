/**
 * Tests for `adev issues board`.
 *
 * The verb exists so the `/adev:issues` Board Display step has a CLI surface
 * instead of a "import getIssueManager + renderTasksMd" lib directive. An
 * agent handed the lib directive has nowhere to go but the backend binary,
 * and a raw `br` call resolves `.beads/` from CWD — inside a linked worktree
 * that dies with SYNC_CONFLICT. Going through the adapter resolves the
 * storage root from the git common dir instead.
 *
 * Covers:
 * - stdout is byte-identical to `renderTasksMd()` over the same board (BEH-2)
 * - the verb never writes tasks.md (INV-6 — `adev status --render` owns that)
 * - --json emits { version, epics, issues } unrendered
 * - --milestone filters epics to that milestone
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { renderTasksMd } from "../../lib/issues/render-markdown.mjs";
import { getIssueManager } from "../../lib/issues/registry.mjs";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "issues", "board", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

/** A git repo with a json-backed board — the default backend, no `br` needed. */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "adev-issues-board-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  execFileSync("git", ["init", "-q", "."], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  return root;
}

const MANIFEST = { tasks: { backend: "json" } };

describe("adev issues board", () => {
  let root;
  let epicId;

  before(async () => {
    root = makeProject();
    const manager = getIssueManager(MANIFEST, root);
    const epic = await manager.createEpic({ title: "Board surface", milestone: "v1" });
    epicId = epic.id;
    await manager.create({ title: "First issue", type: "task", epicId });
    await manager.create({ title: "Second issue", type: "bug", priority: 1 });
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("prints markdown byte-identical to renderTasksMd over the same board", async () => {
    const manager = getIssueManager(MANIFEST, root);
    const epics = await manager.listEpics();
    const issues = await manager.list();
    const expected = renderTasksMd({ version: 1, epics, issues });

    const r = runCli(root, []);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, expected.endsWith("\n") ? expected : expected + "\n");
  });

  it("writes nothing to disk (INV-6)", () => {
    const r = runCli(root, []);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(join(root, ".context-index", "tasks", "tasks.md")), false);
  });

  it("--json emits { version, epics, issues } unrendered", async () => {
    const manager = getIssueManager(MANIFEST, root);
    const epics = await manager.listEpics();
    const issues = await manager.list();

    const r = runCli(root, ["--json"]);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.deepEqual(payload, { version: 1, epics, issues });
    assert.doesNotMatch(r.stdout, /# Issue Board/);
  });

  it("--milestone filters epics to that milestone", async () => {
    const manager = getIssueManager(MANIFEST, root);
    await manager.createEpic({ title: "Other track", milestone: "v2" });

    const r = runCli(root, ["--milestone", "v1", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.epics.length, 1);
    assert.equal(payload.epics[0].id, epicId);
    assert.equal(payload.epics[0].milestone, "v1");
  });

  it("--help prints the board usage and succeeds", () => {
    const r = runCli(root, ["--help"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^usage: adev issues board/m);
    assert.doesNotMatch(r.stdout, /^Subcommands:$/m);
  });
});
