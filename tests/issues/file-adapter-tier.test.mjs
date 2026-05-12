/**
 * Tests for tiered hierarchy and tree walking in lib/issues/file-adapter.mjs.
 *
 * Post-CON-5: FileAdapter is read-only-deprecated. The write-side coverage
 * for cascade-aware close, mixed legacy+tiered round-trip, and missing-parent
 * warnings now lives in the parameterized parity suite
 * (`tests/lib/issues/json-adapter.parity.test.mjs`) which exercises the same
 * semantics against `JsonAdapter`. Here we only verify the read paths and
 * tier-config invariants that remain meaningful for `FileAdapter`.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

function makeAdapter(dir, tierPrefixes = null) {
  const opts = tierPrefixes ? { tierPrefixes } : {};
  return new FileAdapter(dir, opts);
}

function writeTasksFixture(dir, content) {
  const tasksDir = join(dir, ".context-index", "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, "tasks.md"), content);
}

const TIERED_FIXTURE = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| e1 | Epic 1 | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
| e1.f1 | Feature 1 | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
| e1.f1.t1 | Task 1 | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
| e1.f2 | Feature 2 | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
| issue-1 | Legacy issue | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
`;

// ---------------------------------------------------------------------------
// walkTree — read-only
// ---------------------------------------------------------------------------

describe("FileAdapter.walkTree (read-only)", () => {
  let dir, adapter;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-tier-test-"));
    writeTasksFixture(dir, TIERED_FIXTURE);
    adapter = makeAdapter(dir);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns immediate + transitive descendants of a tiered parent", async () => {
    const result = await adapter.walkTree("e1");
    const ids = result.map((i) => i.id);
    assert.ok(ids.includes("e1.f1"));
    assert.ok(ids.includes("e1.f1.t1"));
    assert.ok(ids.includes("e1.f2"));
    assert.ok(!ids.includes("e1"), "Should not include parent itself");
  });

  it("returns descendants sorted by ID (stable order)", async () => {
    const result = await adapter.walkTree("e1");
    const ids = result.map((i) => i.id);
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
  });

  it("returns empty list for a legacy flat ID (issue-N)", async () => {
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
    const result = await adapter.walkTree("e1.f1");
    const ids = result.map((i) => i.id);
    assert.ok(ids.includes("e1.f1.t1"));
    assert.ok(!ids.includes("e1.f2"), "Should not include sibling feature");
    assert.ok(!ids.includes("e1"), "Should not include grandparent");
  });
});

// ---------------------------------------------------------------------------
// Manifest tier config override — read-only
// ---------------------------------------------------------------------------

describe("FileAdapter — manifest tier_prefixes override", () => {
  it("uses custom tier prefixes when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-tierconfig-test-"));
    try {
      const customPrefixes = { x: "Outcome", y: "Initiative", z: "Step" };
      const adapter = makeAdapter(dir, customPrefixes);
      assert.deepEqual(Object.keys(adapter.tierConfig), ["x", "y", "z"]);
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
