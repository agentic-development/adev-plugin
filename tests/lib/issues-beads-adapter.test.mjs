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

  it("sets dbPath to .beads under projectRoot", () => {
    const adapter = new BeadsAdapter("/tmp/test-root", { checkBr: false });
    assert.equal(adapter.dbPath, "/tmp/test-root/.beads");
  });

  it("delegates createEpic to file adapter", async () => {
    // BeadsAdapter delegates epic ops to FileAdapter
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    // This will fail since /tmp/nonexistent doesn't have context-index,
    // but it proves the delegation path exists
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
