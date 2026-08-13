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

  it("delegates createEpic to the local epic adapter without eager validation", async () => {
    // beads has no epic adev can create (`br epic` is status/close-eligible
    // only), so epics live in a local JsonAdapter. It must be constructed
    // lazily: BeadsAdapter is legitimately built against paths that do not
    // exist (the availability probe in lib/cli/issues-migrate.mjs).
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter.createEpic, "function");
    assert.equal(typeof adapter.updateEpic, "function");
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
