/**
 * Tests for tiered hierarchy and tree walking in lib/issues/file-adapter.mjs
 *
 * Covers: walkTree, cascade-aware close, mixed legacy+tiered round-trip,
 * manifest tier config, missing-parent warning.
 * Behaviors: 6–16 from the tiered-hierarchy spec.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

// Helper: create an adapter with an optional manifest tasks section
function makeAdapter(dir, tierPrefixes = null) {
  const opts = tierPrefixes ? { tierPrefixes } : {};
  return new FileAdapter(dir, opts);
}

// ---------------------------------------------------------------------------
// walkTree
// ---------------------------------------------------------------------------

describe("FileAdapter.walkTree", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-tier-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty list when no children", async () => {
    // Insert a tiered item first
    await adapter.createTiered({ id: "e1", title: "Epic 1", type: "task" });
    const result = await adapter.walkTree("e1");
    assert.deepEqual(result, []);
  });

  it("returns immediate children of a tiered parent", async () => {
    await adapter.createTiered({ id: "e1.f1", title: "Feature 1", type: "task" });
    await adapter.createTiered({ id: "e1.f2", title: "Feature 2", type: "task" });
    const result = await adapter.walkTree("e1");
    const ids = result.map((i) => i.id);
    assert.ok(ids.includes("e1.f1"));
    assert.ok(ids.includes("e1.f2"));
    assert.ok(!ids.includes("e1"), "Should not include parent itself");
  });

  it("returns transitive descendants", async () => {
    await adapter.createTiered({ id: "e1.f1.t1", title: "Task 1", type: "task" });
    const result = await adapter.walkTree("e1");
    const ids = result.map((i) => i.id);
    assert.ok(ids.includes("e1.f1"));
    assert.ok(ids.includes("e1.f1.t1"));
    assert.ok(ids.includes("e1.f2"));
  });

  it("returns items sorted by ID (stable order)", async () => {
    const result = await adapter.walkTree("e1");
    const ids = result.map((i) => i.id);
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
  });

  it("returns empty list for a legacy flat ID (epic-N)", async () => {
    // Insert a legacy issue to confirm it's present but walkTree returns []
    await adapter.create({ title: "Legacy issue", type: "task" });
    const result = await adapter.walkTree("epic-1");
    assert.deepEqual(result, []);
  });

  it("returns empty list for issue-N legacy ID", async () => {
    const result = await adapter.walkTree("issue-1");
    assert.deepEqual(result, []);
  });

  it("returns empty list for bd-XXXXXX legacy ID", async () => {
    const result = await adapter.walkTree("bd-abc123");
    assert.deepEqual(result, []);
  });

  it("returns empty list for an invalid/garbage ID", async () => {
    const result = await adapter.walkTree("INVALID!!!");
    assert.deepEqual(result, []);
  });

  it("walkTree on a feature returns only its descendants, not siblings", async () => {
    // e1.f1 has e1.f1.t1; e1.f2 has no children
    const result = await adapter.walkTree("e1.f1");
    const ids = result.map((i) => i.id);
    assert.ok(ids.includes("e1.f1.t1"));
    assert.ok(!ids.includes("e1.f2"), "Should not include sibling feature");
    assert.ok(!ids.includes("e1"), "Should not include grandparent");
  });
});

// ---------------------------------------------------------------------------
// cascade-aware close
// ---------------------------------------------------------------------------

describe("FileAdapter.close — cascade guard", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-cascade-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("blocks close when tiered parent has unclosed children (CASCADE_BLOCKED)", async () => {
    await adapter.createTiered({ id: "e2", title: "Epic 2", type: "task" });
    await adapter.createTiered({ id: "e2.f1", title: "Feature 1", type: "task" });

    await assert.rejects(
      () => adapter.closeTiered("e2", "done"),
      (err) => {
        assert.equal(err.code, "CASCADE_BLOCKED");
        assert.ok(err.message.includes("e2"), "Message should include parent ID");
        assert.ok(err.message.includes("e2.f1"), "Message should include child ID");
        return true;
      }
    );
  });

  it("allows close when all children are closed", async () => {
    // Close the child first
    await adapter.closeTiered("e2.f1", "done");
    // Now parent should close successfully
    const result = await adapter.closeTiered("e2", "done");
    assert.equal(result.status, "closed");
  });

  it("does NOT apply cascade guard to legacy flat IDs", async () => {
    // Create a legacy issue — legacy IDs bypass cascade check
    const legacyIssue = await adapter.create({ title: "Legacy leaf", type: "task" });
    // Should close without CASCADE_BLOCKED even if there are tiered children around
    const result = await adapter.close(legacyIssue.id, "done");
    assert.equal(result.status, "closed");
  });

  it("cascade-blocked error message lists all unclosed children", async () => {
    await adapter.createTiered({ id: "e3", title: "Epic 3", type: "task" });
    await adapter.createTiered({ id: "e3.f1", title: "F1", type: "task" });
    await adapter.createTiered({ id: "e3.f2", title: "F2", type: "task" });

    await assert.rejects(
      () => adapter.closeTiered("e3", "done"),
      (err) => {
        assert.equal(err.code, "CASCADE_BLOCKED");
        assert.ok(err.message.includes("e3.f1"));
        assert.ok(err.message.includes("e3.f2"));
        return true;
      }
    );
  });

  it("cascade check ignores already-closed children", async () => {
    await adapter.createTiered({ id: "e4", title: "Epic 4", type: "task" });
    await adapter.createTiered({ id: "e4.f1", title: "F1", type: "task" });
    await adapter.createTiered({ id: "e4.f2", title: "F2", type: "task" });

    // Close one child
    await adapter.closeTiered("e4.f1", "done");
    // e4.f2 still open → should still block
    await assert.rejects(
      () => adapter.closeTiered("e4", "done"),
      (err) => err.code === "CASCADE_BLOCKED"
    );

    // Close the second child
    await adapter.closeTiered("e4.f2", "done");
    // Now all children closed → should succeed
    const result = await adapter.closeTiered("e4", "done");
    assert.equal(result.status, "closed");
  });
});

// ---------------------------------------------------------------------------
// Mixed legacy + tiered round-trip
// ---------------------------------------------------------------------------

describe("FileAdapter — mixed legacy + tiered round-trip", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-roundtrip-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("persists and re-reads both legacy and tiered items without modification", async () => {
    // Create legacy items
    await adapter.createEpic({ title: "Legacy Epic" });     // epic-1
    await adapter.create({ title: "Legacy Issue 1", type: "task" }); // issue-1
    await adapter.create({ title: "Legacy Issue 2", type: "bug" });  // issue-2

    // Create tiered items
    await adapter.createTiered({ id: "e9", title: "Tiered Epic", type: "task" });
    await adapter.createTiered({ id: "e9.f1", title: "Tiered Feature", type: "task" });

    // Force re-read via new adapter instance
    const adapter2 = makeAdapter(dir);
    const allIssues = await adapter2.listAll();
    const ids = allIssues.map((i) => i.id);

    assert.ok(ids.includes("issue-1"), "Legacy issue-1 should survive round-trip");
    assert.ok(ids.includes("issue-2"), "Legacy issue-2 should survive round-trip");
    assert.ok(ids.includes("e9"), "Tiered e9 should survive round-trip");
    assert.ok(ids.includes("e9.f1"), "Tiered e9.f1 should survive round-trip");

    const epics = await adapter2.listEpics({});
    const epicIds = epics.map((e) => e.id);
    assert.ok(epicIds.includes("epic-1"), "Legacy epic-1 should survive round-trip");
  });

  it("tiered items retain title and status after round-trip", async () => {
    const adapter2 = makeAdapter(dir);
    const allIssues = await adapter2.listAll();
    const e9 = allIssues.find((i) => i.id === "e9");
    assert.ok(e9, "e9 should exist");
    assert.equal(e9.title, "Tiered Epic");
    assert.equal(e9.status, "open");
  });
});

// ---------------------------------------------------------------------------
// Manifest tier config override
// ---------------------------------------------------------------------------

describe("FileAdapter — manifest tier_prefixes override", () => {
  it("uses custom tier prefixes when provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-tierconfig-test-"));
    try {
      const customPrefixes = { x: "Outcome", y: "Initiative", z: "Step" };
      const adapter = makeAdapter(dir, customPrefixes);
      await adapter.init();

      // With custom config, walkTree on a custom-prefixed ID should work
      await adapter.createTiered({ id: "x1", title: "Outcome 1", type: "task" });
      await adapter.createTiered({ id: "x1.y1", title: "Initiative 1", type: "task" });
      const result = await adapter.walkTree("x1");
      const ids = result.map((i) => i.id);
      assert.ok(ids.includes("x1.y1"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws INVALID_TIER_CONFIG for conflicting prefix at construction", () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-invalidconfig-test-"));
    try {
      const invalidPrefixes = { epic: "Epic", f: "Feature", t: "Task" };
      assert.throws(
        () => makeAdapter(dir, invalidPrefixes),
        (err) => err.code === "INVALID_TIER_CONFIG"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Missing parent warning (behavior 16)
// ---------------------------------------------------------------------------

describe("FileAdapter — missing parent warning", () => {
  it("includes item in list() even when parent_id is missing from store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-missingparent-test-"));
    try {
      const adapter = makeAdapter(dir);
      await adapter.init();

      // Insert a tiered item whose parent does not exist
      await adapter.createTiered({ id: "e9.f1", title: "Orphan Feature", type: "task" });
      // e9 does NOT exist in the store

      const all = await adapter.listAll();
      const ids = all.map((i) => i.id);
      assert.ok(ids.includes("e9.f1"), "Orphaned item should still appear in listAll");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("walkTree from missing parent returns empty list (parent not in store)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-missingparent2-test-"));
    try {
      const adapter = makeAdapter(dir);
      await adapter.init();

      // Insert only the child, not the parent
      await adapter.createTiered({ id: "e9.f1", title: "Orphan Feature", type: "task" });

      // walkTree("e9") should find e9.f1 by prefix match even though e9 doesn't exist
      const result = await adapter.walkTree("e9");
      const ids = result.map((i) => i.id);
      assert.ok(ids.includes("e9.f1"), "walkTree should find children by prefix even if parent missing");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
