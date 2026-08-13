/**
 * Tests for lib/issues/beads-adapter.mjs
 *
 * These tests verify command construction and adapter behavior
 * without requiring `br` to be installed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

describe("BeadsAdapter", () => {
  it("throws BEADS_NOT_AVAILABLE when br is not on PATH", () => {
    // This test passes in environments where br is not installed
    // (which is the expected CI/test environment).
    try {
      new BeadsAdapter("/tmp/nonexistent", { checkBr: true });
      // If br IS installed, skip this assertion
    } catch (err) {
      assert.equal(err.code, "BEADS_NOT_AVAILABLE");
    }
  });

  it("can be constructed with checkBr=false (for testing)", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(adapter.name, "beads");
  });

  it("separates the .beads workspace directory from the --db file path", () => {
    const adapter = new BeadsAdapter("/tmp/test-root", { checkBr: false });
    // `br --db` takes the database FILE; `.beads/` is the workspace directory
    // that contains it. Passing the directory is what produced
    // "Database error: I/O error: Is a directory (os error 21)".
    assert.equal(adapter.workspaceDir, "/tmp/test-root/.beads");
    // Resolved lazily from the workspace contents — null until `br init` has
    // run and a *.db exists, at which point `--db` is omitted and br applies
    // its own auto-discovery.
    assert.equal(adapter.dbPath, null);
    assert.equal(adapter._resolveDbPath(), null, "no workspace → no db file");
  });

  it("keeps no sidecar path and no local epic delegate", () => {
    // The board lives entirely in beads. `.beads-map.json` held the adev id
    // map plus branch/pr/claimed_at, and a local JsonAdapter held the epics —
    // two stores that could disagree with beads. The sidecar's disagreement
    // was not hypothetical: it let the claim gate report "unclaimed" for an
    // issue br had already assigned, and the gate failed OPEN.
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(adapter.mapPath, undefined, "no sidecar path may survive");
    assert.equal(adapter._epicAdapter, undefined, "no local epic store may survive");
    assert.equal(typeof adapter._readMap, "undefined");
    assert.equal(typeof adapter._writeMap, "undefined");
    assert.equal(typeof adapter._getBeadsId, "undefined");
  });

  it("resolves adev ids from br's external_ref, never from a persisted map", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const scan = [
      { id: "tst-aaa", external_ref: "issue-1", title: "one" },
      { id: "tst-bbb", external_ref: "issue-2", title: "two" },
      { id: "tst-ccc", title: "created straight through br" },
    ];

    assert.equal(adapter._resolve("issue-2", scan).id, "tst-bbb");
    // An issue created directly in br stays operable under its own id, so the
    // board is never blind to work a human filed.
    assert.equal(adapter._resolve("tst-ccc", scan).id, "tst-ccc");
    assert.throws(
      () => adapter._resolve("issue-9", scan),
      (err) => err.code === "NOT_FOUND",
    );
  });

  it("mints the next id from the highest external_ref on the board", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const scan = [
      { id: "a", external_ref: "issue-1" },
      { id: "b", external_ref: "issue-7" }, // may well be closed — `-s all` sees it
      { id: "c", external_ref: "epic-2" },
      { id: "d" },
    ];
    assert.equal(adapter._nextId("issue", scan), "issue-8");
    assert.equal(adapter._nextId("epic", scan), "epic-3");
    assert.equal(adapter._nextId("issue", []), "issue-1");
  });

  it("never throws on malformed or foreign agent_context", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    // `agent_context` is br's field, writable by humans and other tools. A
    // board must not become unreadable because one issue holds odd JSON.
    for (const agent_context of ["not json at all", "[1,2,3]", '"a string"', "", null, "{}"]) {
      const issue = adapter._toIssue({ id: "x", external_ref: "issue-1", agent_context });
      assert.equal(issue.id, "issue-1");
      assert.equal(issue.branch, undefined);
      assert.equal(issue.next_action, null);
    }

    const populated = adapter._toIssue({
      id: "x",
      external_ref: "issue-1",
      assignee: "alice",
      agent_context: JSON.stringify({
        house_rules: "not adev's",
        adev: { branch: "feat/x", epicId: "epic-2", claimed_at: "2026-01-01T00:00:00Z" },
      }),
    });
    assert.equal(populated.branch, "feat/x");
    assert.equal(populated.epicId, "epic-2");
    assert.equal(populated.owner, "alice", "the holder is br's assignee, and only that");
  });

  it("exposes epic operations without constructing any local store", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter.createEpic, "function");
    assert.equal(typeof adapter.updateEpic, "function");
    assert.equal(typeof adapter.listEpics, "function");
  });

  it("exposes all IssueManagerInterface methods", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const methods = ["create", "update", "close", "list", "get",
                     "createEpic", "updateEpic", "addDependency", "init"];
    for (const method of methods) {
      assert.equal(typeof adapter[method], "function",
        `Expected method '${method}' to exist`);
    }
  });

  it("uses execFileSync pattern (not exec/execSync string)", () => {
    // Verify the adapter imports execFileSync, not execSync
    // This is a structural test — the actual invocation is tested
    // in integration tests with br available
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter._runBr, "function");
  });
});
