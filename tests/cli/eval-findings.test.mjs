/**
 * Tests for `adev eval findings <queue|list|file>`.
 *
 * adev-plugin-tierb-findings-queue-bsb9: a manual Tier B / operator-half
 * eval pass had no durable fallback for a real finding discovered while the
 * issue board was unreachable, other than markdown prose nothing re-read.
 *
 * Covers:
 * - queue appends a finding and prints its minted id
 * - queue requires --title and --description
 * - list reports queued findings, empty or not
 * - file creates a real bug via the issue store, sets --affected-modules
 *   from the finding's module when present, and drains the finding
 * - file on an unknown finding id exits 1
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../../cli/index.mjs", import.meta.url));

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI, "eval", "findings", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ADEV_SILENCE_SHADOW_BOARD: "1" },
  });
}

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), "adev-eval-findings-"));
  mkdirSync(join(root, ".context-index"), { recursive: true });
  writeFileSync(join(root, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\nmodules:\n  - slug: cli\n");
  execFileSync("git", ["init", "-q", "."], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "t"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "init"], { cwd: root });
  return root;
}

function readBoard(root) {
  return JSON.parse(readFileSync(join(root, ".context-index", "tasks", "tasks.json"), "utf8"));
}

describe("adev eval findings queue / list", () => {
  let root;

  before(() => {
    root = makeProject();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("list reports no pending findings on a fresh project", () => {
    const r = runCli(root, ["list"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no pending findings/);
  });

  it("list --json reports an empty array on a fresh project", () => {
    const r = runCli(root, ["list", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { findings: [] });
  });

  it("queue requires --title", () => {
    const r = runCli(root, ["queue", "--description", "x"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /EVAL_FINDING_INVALID/);
  });

  it("queue requires --description", () => {
    const r = runCli(root, ["queue", "--title", "x"]);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /EVAL_FINDING_INVALID/);
  });

  it("queue appends a finding and prints its minted id", () => {
    const r = runCli(root, ["queue", "--title", "Real defect", "--description", "found live", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(r.stdout);
    assert.match(record.id, /^[0-9a-f]{8}$/);
    assert.equal(record.title, "Real defect");

    const listed = JSON.parse(runCli(root, ["list", "--json"]).stdout);
    assert.equal(listed.findings.length, 1);
    assert.equal(listed.findings[0].id, record.id);
  });
});

describe("adev eval findings file", () => {
  let root;

  after(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("files a queued finding as a real bug, sets --affected-modules from the finding's module, and drains the queue", () => {
    root = makeProject();
    const queued = JSON.parse(
      runCli(root, [
        "queue", "--title", "Real defect", "--description", "found live", "--module", "cli", "--json",
      ]).stdout
    );

    const r = runCli(root, ["file", queued.id, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);
    assert.equal(result.drained, queued.id);

    const board = readBoard(root);
    const filed = board.issues.find((i) => i.id === result.filed);
    assert.ok(filed, "the filed bug landed on the board");
    assert.equal(filed.type, "bug");
    assert.equal(filed.title, "Real defect");
    assert.deepEqual(filed.affected_modules, ["cli"]);

    const stillQueued = JSON.parse(runCli(root, ["list", "--json"]).stdout);
    assert.deepEqual(stillQueued.findings, []);
  });

  it("files a queued finding with no module unset (no affected_modules)", () => {
    root = makeProject();
    const queued = JSON.parse(
      runCli(root, ["queue", "--title", "No module", "--description", "x", "--json"]).stdout
    );
    const r = runCli(root, ["file", queued.id, "--json"]);
    assert.equal(r.status, 0, r.stderr);
    const result = JSON.parse(r.stdout);

    const board = readBoard(root);
    const filed = board.issues.find((i) => i.id === result.filed);
    assert.equal(filed.affected_modules, undefined);
  });

  it("exits 1 for an unknown finding id, without touching the board", () => {
    root = makeProject();
    const r = runCli(root, ["file", "does-not-exist"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /EVAL_FINDING_NOT_FOUND/);
    // No create() call was ever reached — the board file need not even exist yet.
    assert.equal(existsSync(join(root, ".context-index", "tasks", "tasks.json")), false);
  });
});
