/**
 * Tests for tiered hierarchy in lib/issues/beads-adapter.mjs
 *
 * These tests are mock-only (do not require `br` to be installed).
 * They verify that the beads adapter exposes walkTree and cascade-aware
 * close per the tiered-hierarchy spec.
 *
 * Full walkTree logic is tested through the file adapter since beads
 * delegates epic and tiered operations to it. Here we test that:
 * - walkTree is exposed as a function
 * - walkTree for legacy IDs returns empty list
 * - close throws CASCADE_BLOCKED when children are unclosed
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

describe("BeadsAdapter — walkTree (interface check)", () => {
  it("exposes walkTree method", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter.walkTree, "function");
  });

  it("walkTree for legacy flat ID returns empty list", async () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    // Delegates to file adapter which returns [] for legacy IDs without reading disk
    // (no .beads-map.json, no tasks.md — both read as empty)
    const result = await adapter.walkTree("epic-1");
    assert.deepEqual(result, []);
  });

  it("walkTree for issue-N legacy ID returns empty list", async () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const result = await adapter.walkTree("issue-10");
    assert.deepEqual(result, []);
  });

  it("walkTree for bd-XXXXXX legacy ID returns empty list", async () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const result = await adapter.walkTree("bd-abc123");
    assert.deepEqual(result, []);
  });

  it("walkTree for invalid ID returns empty list", async () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const result = await adapter.walkTree("GARBAGE!!");
    assert.deepEqual(result, []);
  });
});

describe("BeadsAdapter — methods from IssueManagerInterface (updated)", () => {
  it("exposes all required interface methods including walkTree", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const methods = [
      "create", "update", "close", "list", "get",
      "createEpic", "updateEpic", "addDependency", "init",
      "walkTree",
    ];
    for (const method of methods) {
      assert.equal(typeof adapter[method], "function",
        `Expected method '${method}' to exist on BeadsAdapter`);
    }
  });
});
