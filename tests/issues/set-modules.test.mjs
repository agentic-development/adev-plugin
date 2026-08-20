/**
 * Tests for `adev issues set-modules` (lib/cli/issues-set-modules.mjs).
 *
 * v1's producer for `WorkItem.affected_modules`. Written to close WR-1 from
 * bug-selection-and-eligibility.spec.md's round-3 review: no producer for
 * `affected_modules` existed anywhere in that milestone's shipped Task Map,
 * so `adev issues next` could never return a real bug on any backend. This
 * verb is that producer, and this test proves it is real end-to-end on the
 * JSON backend via the same CLI dispatch path `adev issues claim` uses.
 *
 * The beads-backend write path (agent_context.adev round-trip) is covered
 * separately in tests/issues/beads-adapter.test.mjs (RI-2 fix).
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { run as runIssues } from "../../lib/cli/issues.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "issue-set-modules-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

/** Capture console output while running `fn`. */
async function capture(fn) {
  const out = [];
  const err = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => out.push(a.join(" "));
  console.error = (...a) => err.push(a.join(" "));
  try {
    const code = await fn();
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

describe("adev issues set-modules — CLI", () => {
  let dir, manifest, issueId;

  before(async () => {
    dir = makeProject();
    const adapter = new JsonAdapter(dir);
    await adapter.init();
    manifest = { tasks: { backend: "json" } };
  });

  beforeEach(async () => {
    const adapter = new JsonAdapter(dir);
    const issue = await adapter.create({ title: "bug needing a module tag", type: "bug" });
    issueId = issue.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  const call = (argv) => capture(() => runIssues({ projectRoot: dir, argv, manifest }));

  it("sets a single affected_modules entry and exits 0", async () => {
    const { code, out } = await call(["set-modules", issueId, "cli"]);
    assert.equal(code, 0);
    assert.match(out, /affected_modules = \[cli\]/);

    const adapter = new JsonAdapter(dir);
    const issue = await adapter.get(issueId);
    assert.deepEqual(issue.affected_modules, ["cli"]);
  });

  it("splits a comma-separated slug list", async () => {
    const { code } = await call(["set-modules", issueId, "cli,hooks"]);
    assert.equal(code, 0);

    const adapter = new JsonAdapter(dir);
    const issue = await adapter.get(issueId);
    assert.deepEqual(issue.affected_modules, ["cli", "hooks"]);
  });

  it("supports --json output", async () => {
    const { code, out } = await call(["set-modules", issueId, "cli", "--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out);
    assert.equal(parsed.id, issueId);
    assert.deepEqual(parsed.affected_modules, ["cli"]);
  });

  it("exits 1 with usage on a missing modules argument", async () => {
    const { code, err } = await call(["set-modules", issueId]);
    assert.equal(code, 1);
    assert.match(err, /usage: adev issues set-modules/);
  });

  it("exits 1 on an unknown issue id", async () => {
    const { code, err } = await call(["set-modules", "issue-does-not-exist", "cli"]);
    assert.equal(code, 1);
    assert.match(err, /not found|Issue not found/i);
  });

  it("is reachable through the parent `adev issues` dispatcher, not just directly", async () => {
    // Regression guard: WR-1 was specifically about no producer existing
    // ANYWHERE in the shipped surface, not just in a standalone module. This
    // asserts the dispatcher in lib/cli/issues.mjs actually routes to it.
    const { code } = await call(["set-modules", issueId, "review-gate"]);
    assert.equal(code, 0);
  });
});
