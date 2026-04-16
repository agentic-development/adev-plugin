/**
 * Tests for the unified create() and close() API (issue-78).
 *
 * Covers:
 * - create() without parent_id → legacy flat ID (back-compat)
 * - create() with parent_id → tiered ID inferred from parent depth
 * - create() at each tier level (e, f, t) with default TierConfig
 * - create() with explicit tier_prefix overrides inference
 * - MAX_DEPTH_EXCEEDED when parent is at max tier depth
 * - PARENT_NOT_FOUND when parent_id doesn't exist
 * - INVALID_TIER_PREFIX when tier_prefix not in TierConfig
 * - ID_MISMATCH when explicit id conflicts with inferred prefix
 * - spec_ref field round-trip on file adapter
 * - close() applies cascade guard for tiered IDs
 * - close() does NOT apply cascade guard for legacy flat IDs
 * - createEpic() continues to work (delegates, backward compat)
 * - createEpic() emits deprecation warning when ADEV_DEPRECATION_WARN=1
 * - updateEpic() continues to work (delegates, backward compat)
 * - updateEpic() emits deprecation warning when ADEV_DEPRECATION_WARN=1
 * - parent_id set on created item when tiered path used
 *
 * Behaviors from spec: unified-create-api, behaviors 1–11
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(dir, tierPrefixes = null) {
  const opts = tierPrefixes ? { tierPrefixes } : {};
  return new FileAdapter(dir, opts);
}

// ---------------------------------------------------------------------------
// Unified create() — root-level (no parent_id)
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — root-level (no parent_id)", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-root-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a legacy flat ID (issue-N) when no parent_id or tier_prefix given", async () => {
    const item = await adapter.create({ title: "Legacy issue", type: "task" });
    assert.match(item.id, /^issue-\d+$/, "should produce legacy issue-N ID");
  });

  it("creates a tiered root item (e1) when tier_prefix='e' explicitly given", async () => {
    const item = await adapter.create({ title: "Root epic", type: "epic", tier_prefix: "e" });
    assert.match(item.id, /^e\d+$/, "should produce tiered e<N> ID");
  });

  it("monotonically increments tiered root IDs", async () => {
    const a = await adapter.create({ title: "Root A", tier_prefix: "e" });
    const b = await adapter.create({ title: "Root B", tier_prefix: "e" });
    const aNum = parseInt(a.id.replace("e", ""), 10);
    const bNum = parseInt(b.id.replace("e", ""), 10);
    assert.ok(bNum > aNum, "second root ID counter should be greater");
  });
});

// ---------------------------------------------------------------------------
// Unified create() — tiered items with parent_id
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — tiered items with parent_id", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-tiered-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();

    // Seed a root epic
    await adapter.createTiered({ id: "e1", title: "Epic 1", type: "epic" });
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a child feature (e1.f1) from parent e1 — infers 'f' prefix", async () => {
    const item = await adapter.create({ title: "Feature 1", type: "feature", parent_id: "e1" });
    assert.equal(item.id, "e1.f1");
    assert.equal(item.parent_id, "e1");
  });

  it("creates a second child feature (e1.f2) — monotonically increments", async () => {
    const item = await adapter.create({ title: "Feature 2", type: "feature", parent_id: "e1" });
    assert.equal(item.id, "e1.f2");
  });

  it("creates a task (e1.f1.t1) from parent e1.f1 — infers 't' prefix", async () => {
    const item = await adapter.create({ title: "Task 1", type: "task", parent_id: "e1.f1" });
    assert.equal(item.id, "e1.f1.t1");
    assert.equal(item.parent_id, "e1.f1");
  });

  it("creates a second task (e1.f1.t2)", async () => {
    const item = await adapter.create({ title: "Task 2", type: "task", parent_id: "e1.f1" });
    assert.equal(item.id, "e1.f1.t2");
  });

  it("returned item has correct title and status", async () => {
    const item = await adapter.create({ title: "Feature 3", type: "feature", parent_id: "e1" });
    assert.equal(item.title, "Feature 3");
    assert.equal(item.status, "open");
    assert.equal(item.type, "feature");
  });

  it("item is persisted and readable via get()", async () => {
    const created = await adapter.create({ title: "Persisted Feature", type: "feature", parent_id: "e1" });
    const fetched = await adapter.get(created.id);
    assert.ok(fetched, "item should be found after creation");
    assert.equal(fetched.title, "Persisted Feature");
    assert.equal(fetched.id, created.id);
  });
});

// ---------------------------------------------------------------------------
// MAX_DEPTH_EXCEEDED
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — MAX_DEPTH_EXCEEDED", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-maxdepth-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();

    // Seed e1 → e1.f1 → e1.f1.t1 (depth 3, max depth with default config)
    await adapter.createTiered({ id: "e1", title: "Epic 1", type: "epic" });
    await adapter.createTiered({ id: "e1.f1", title: "Feature 1", type: "feature" });
    await adapter.createTiered({ id: "e1.f1.t1", title: "Task 1", type: "task" });
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws MAX_DEPTH_EXCEEDED when parent is at max tier depth (t1 in 3-tier config)", async () => {
    await assert.rejects(
      () => adapter.create({ title: "Sub-task", parent_id: "e1.f1.t1" }),
      (err) => {
        assert.equal(err.code, "MAX_DEPTH_EXCEEDED");
        assert.ok(err.message.includes("e1.f1.t1"), "message should include parent ID");
        assert.ok(err.message.includes("max tier depth"), "message should mention max tier depth");
        assert.ok(err.message.includes("Extend tasks.tier_prefixes"), "message should mention extending config");
        return true;
      }
    );
  });

  it("does NOT throw MAX_DEPTH_EXCEEDED for features (depth 2 of 3)", async () => {
    // e1.f1 is at depth 2, max is 3 — can still create child tasks
    const item = await adapter.create({ title: "Another task", type: "task", parent_id: "e1.f1" });
    assert.ok(item.id.startsWith("e1.f1.t"), "should produce a task-level ID");
  });

  it("allows deeper nesting when TierConfig is extended", async () => {
    const dir2 = mkdtempSync(join(tmpdir(), "unified-create-extended-tier-test-"));
    try {
      const customAdapter = makeAdapter(dir2, { e: "Epic", f: "Feature", t: "Task", s: "Subtask" });
      await customAdapter.init();

      await customAdapter.createTiered({ id: "e1", title: "Epic", type: "epic" });
      await customAdapter.createTiered({ id: "e1.f1", title: "Feature", type: "feature" });
      await customAdapter.createTiered({ id: "e1.f1.t1", title: "Task", type: "task" });

      // With 4-tier config, t1 is NOT at max depth
      const sub = await customAdapter.create({ title: "Subtask", parent_id: "e1.f1.t1" });
      assert.match(sub.id, /^e1\.f1\.t1\.s\d+$/, "should produce subtask-level ID");
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// PARENT_NOT_FOUND
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — PARENT_NOT_FOUND", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-parent-notfound-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws PARENT_NOT_FOUND when parent_id does not exist in the store", async () => {
    await assert.rejects(
      () => adapter.create({ title: "Orphan Feature", parent_id: "e99" }),
      (err) => {
        assert.equal(err.code, "PARENT_NOT_FOUND");
        assert.ok(err.message.includes("e99"));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// INVALID_TIER_PREFIX
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — INVALID_TIER_PREFIX", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-invalid-prefix-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws INVALID_TIER_PREFIX when explicit tier_prefix is not in TierConfig", async () => {
    await assert.rejects(
      () => adapter.create({ title: "Bad prefix", tier_prefix: "z" }),
      (err) => {
        assert.equal(err.code, "INVALID_TIER_PREFIX");
        assert.ok(err.message.includes("z"), "message should include the invalid prefix");
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// ID_MISMATCH
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — ID_MISMATCH", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-id-mismatch-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
    await adapter.createTiered({ id: "e1", title: "Epic 1", type: "epic" });
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws ID_MISMATCH when explicit id has wrong prefix for parent_id", async () => {
    await assert.rejects(
      () => adapter.create({ title: "Mismatched", parent_id: "e1", id: "e1.t999" }),
      (err) => {
        assert.equal(err.code, "ID_MISMATCH");
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// spec_ref field round-trip
// ---------------------------------------------------------------------------

describe("FileAdapter — spec_ref field round-trip", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-create-specref-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates an issue with spec_ref and reads it back via get()", async () => {
    const item = await adapter.create({
      title: "Feature with spec",
      type: "feature",
      spec_ref: ".context-index/specs/features/my-feature.md",
    });
    assert.equal(item.spec_ref, ".context-index/specs/features/my-feature.md");

    const fetched = await adapter.get(item.id);
    assert.equal(fetched.spec_ref, ".context-index/specs/features/my-feature.md");
  });

  it("creates an issue without spec_ref — reads back as undefined/empty", async () => {
    const item = await adapter.create({ title: "Feature without spec", type: "feature" });
    // spec_ref should be undefined or null (not a truthy value)
    assert.ok(!item.spec_ref, "spec_ref should be falsy when not provided");

    const fetched = await adapter.get(item.id);
    assert.ok(!fetched.spec_ref, "spec_ref should be falsy after round-trip");
  });

  it("spec_ref round-trips with both planRef and spec_ref set (they are distinct)", async () => {
    const item = await adapter.create({
      title: "Feature with both refs",
      type: "feature",
      planRef: ".context-index/plans/my-plan.md",
      spec_ref: ".context-index/specs/features/my-feature.md",
    });

    const fetched = await adapter.get(item.id);
    assert.equal(fetched.planRef, ".context-index/plans/my-plan.md");
    assert.equal(fetched.spec_ref, ".context-index/specs/features/my-feature.md");
  });

  it("serializes Spec-Ref column in tasks.md markdown table", async () => {
    const content = readFileSync(join(dir, ".context-index", "tasks", "tasks.md"), "utf8");
    assert.ok(content.includes("Spec-Ref"), "Header should include Spec-Ref column");
  });

  it("spec_ref round-trips for tiered items", async () => {
    await adapter.createTiered({ id: "e5", title: "Epic 5", type: "epic" });
    const item = await adapter.create({
      title: "Tiered feature with spec",
      type: "feature",
      parent_id: "e5",
      spec_ref: ".context-index/specs/features/tiered-feature.md",
    });
    assert.equal(item.spec_ref, ".context-index/specs/features/tiered-feature.md");

    const fetched = await adapter.get(item.id);
    assert.equal(fetched.spec_ref, ".context-index/specs/features/tiered-feature.md");
  });
});

// ---------------------------------------------------------------------------
// Unified close() — cascade guard
// ---------------------------------------------------------------------------

describe("FileAdapter.close() — unified cascade guard", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-close-cascade-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws CASCADE_BLOCKED when closing tiered parent with unclosed children", async () => {
    await adapter.createTiered({ id: "e10", title: "Epic 10", type: "epic" });
    await adapter.createTiered({ id: "e10.f1", title: "Feature 1", type: "feature" });

    await assert.rejects(
      () => adapter.close("e10", "done"),
      (err) => {
        assert.equal(err.code, "CASCADE_BLOCKED");
        assert.ok(err.message.includes("e10.f1"));
        return true;
      }
    );
  });

  it("allows close when all children are closed", async () => {
    await adapter.close("e10.f1", "done");
    const result = await adapter.close("e10", "done");
    assert.equal(result.status, "closed");
  });

  it("does NOT apply cascade guard to legacy flat IDs", async () => {
    const legacy = await adapter.create({ title: "Legacy flat", type: "task" });
    // Should close without CASCADE_BLOCKED
    const result = await adapter.close(legacy.id, "done");
    assert.equal(result.status, "closed");
  });
});

// ---------------------------------------------------------------------------
// Deprecated wrappers: createEpic / updateEpic
// ---------------------------------------------------------------------------

describe("FileAdapter — deprecated createEpic / updateEpic wrappers", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-deprecated-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("createEpic() continues to work (creates epic with legacy epic-N ID)", async () => {
    const epic = await adapter.createEpic({ title: "My Legacy Epic" });
    assert.match(epic.id, /^epic-\d+$/, "should produce legacy epic-N ID");
    assert.equal(epic.title, "My Legacy Epic");
  });

  it("updateEpic() continues to work (updates epic)", async () => {
    const epic = await adapter.createEpic({ title: "Original Title" });
    const updated = await adapter.updateEpic(epic.id, { title: "Updated Title" });
    assert.equal(updated.title, "Updated Title");
  });

  it("createEpic() does NOT emit warning when ADEV_DEPRECATION_WARN is not set", async () => {
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };
    delete process.env.ADEV_DEPRECATION_WARN;

    try {
      await adapter.createEpic({ title: "Silent Epic" });
      assert.equal(warnCalled, false, "warn should not be called when env var not set");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("createEpic() emits deprecation warning when ADEV_DEPRECATION_WARN=1", async () => {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (msg) => { warnings.push(msg); };
    process.env.ADEV_DEPRECATION_WARN = "1";

    try {
      await adapter.createEpic({ title: "Warned Epic" });
      assert.ok(warnings.length > 0, "warn should be called");
      assert.ok(
        warnings.some((w) => w.includes("createEpic is deprecated")),
        "warning message should mention createEpic is deprecated"
      );
      assert.ok(
        warnings.some((w) => w.includes("create()")),
        "warning message should suggest create()"
      );
    } finally {
      console.warn = originalWarn;
      delete process.env.ADEV_DEPRECATION_WARN;
    }
  });

  it("updateEpic() emits deprecation warning when ADEV_DEPRECATION_WARN=1", async () => {
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (msg) => { warnings.push(msg); };
    process.env.ADEV_DEPRECATION_WARN = "1";

    try {
      const epic = await adapter.createEpic({ title: "Epic to update" });
      warnings.length = 0; // reset after createEpic warning

      await adapter.updateEpic(epic.id, { milestone: "v2" });
      assert.ok(warnings.length > 0, "warn should be called for updateEpic");
      assert.ok(
        warnings.some((w) => w.includes("updateEpic is deprecated")),
        "warning message should mention updateEpic is deprecated"
      );
    } finally {
      console.warn = originalWarn;
      delete process.env.ADEV_DEPRECATION_WARN;
    }
  });

  it("createEpic() does NOT emit warning when ADEV_DEPRECATION_WARN=0", async () => {
    const originalWarn = console.warn;
    let warnCalled = false;
    console.warn = () => { warnCalled = true; };
    process.env.ADEV_DEPRECATION_WARN = "0";

    try {
      await adapter.createEpic({ title: "Silent Epic 0" });
      assert.equal(warnCalled, false, "warn should not be called when env var is '0'");
    } finally {
      console.warn = originalWarn;
      delete process.env.ADEV_DEPRECATION_WARN;
    }
  });
});

// ---------------------------------------------------------------------------
// spec_ref field validation in interface.mjs
// ---------------------------------------------------------------------------

describe("validateIssue — spec_ref field", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "unified-specref-validate-test-"));
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts spec_ref as a string", async () => {
    const item = await adapter.create({
      title: "Valid spec_ref",
      spec_ref: "specs/my-spec.md",
    });
    assert.equal(item.spec_ref, "specs/my-spec.md");
  });

  it("creates item without spec_ref — field is absent/falsy", async () => {
    const item = await adapter.create({ title: "No spec_ref" });
    assert.ok(!item.spec_ref);
  });
});

// ---------------------------------------------------------------------------
// Custom tier config — tier inference with overrides
// ---------------------------------------------------------------------------

describe("FileAdapter.create() — custom tier config inference", () => {
  it("infers next prefix from custom TierConfig order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unified-create-custom-tier-test-"));
    try {
      const customAdapter = makeAdapter(dir, { x: "Outcome", y: "Initiative", z: "Step" });
      await customAdapter.init();

      // Create root item
      const root = await customAdapter.create({ title: "Outcome 1", tier_prefix: "x" });
      assert.match(root.id, /^x\d+$/);

      // Create child — should infer "y" prefix (second in order)
      await customAdapter.createTiered({ id: "x1", title: "Outcome 1 (seeded)", type: "task" });
      const child = await customAdapter.create({ title: "Initiative 1", parent_id: "x1" });
      assert.match(child.id, /^x1\.y\d+$/);

      // Create grandchild — should infer "z" prefix (third in order)
      await customAdapter.createTiered({ id: "x1.y1", title: "Initiative 1 (seeded)", type: "task" });
      const grandchild = await customAdapter.create({ title: "Step 1", parent_id: "x1.y1" });
      assert.match(grandchild.id, /^x1\.y1\.z\d+$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
