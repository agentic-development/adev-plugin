/**
 * Tests for the unified create() and close() API (issue-78).
 *
 * Originally written against `FileAdapter`. Post-CON-5 the `file` backend is
 * read-only-deprecated, so these behaviors are now exercised against
 * `JsonAdapter` — the new default backend. The parity invariant means every
 * one of these tests holds for both adapters; `FileAdapter`-specific write
 * coverage now lives only in the deprecation-throw tests.
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
 * - spec_ref field round-trip
 * - close() applies cascade guard for tiered IDs
 * - close() does NOT apply cascade guard for legacy flat IDs
 * - createEpic() continues to work (delegates, backward compat)
 * - createEpic() emits deprecation warning when ADEV_DEPRECATION_WARN=1
 * - updateEpic() continues to work (delegates, backward compat)
 * - parent_id set on created item when tiered path used
 *
 * Behaviors from spec: unified-create-api, behaviors 1–11
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(slug) {
  const dir = mkdtempSync(join(tmpdir(), `${slug}-`));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

function makeAdapter(dir, tierPrefixes = null) {
  const opts = tierPrefixes ? { tierPrefixes } : {};
  return new JsonAdapter(dir, opts);
}

// ---------------------------------------------------------------------------
// Unified create() — root-level (no parent_id)
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — root-level (no parent_id)", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-create-root-test");
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a legacy flat ID (issue-N) when no parent_id or tier_prefix given", async () => {
    const item = await adapter.create({ title: "Legacy issue", type: "task" });
    assert.match(item.id, /^issue-\d+$/);
  });

  it("creates a tiered root item (e1) when tier_prefix='e' explicitly given", async () => {
    const item = await adapter.create({ title: "Root epic", type: "epic", tier_prefix: "e" });
    assert.match(item.id, /^e\d+$/);
  });

  it("monotonically increments tiered root IDs", async () => {
    const a = await adapter.create({ title: "Root A", tier_prefix: "e" });
    const b = await adapter.create({ title: "Root B", tier_prefix: "e" });
    const aNum = parseInt(a.id.replace("e", ""), 10);
    const bNum = parseInt(b.id.replace("e", ""), 10);
    assert.ok(bNum > aNum);
  });
});

// ---------------------------------------------------------------------------
// Unified create() — tiered items with parent_id
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — tiered items with parent_id", () => {
  let dir, adapter, e1Id;

  before(async () => {
    dir = makeProject("unified-create-tiered-test");
    adapter = makeAdapter(dir);
    await adapter.init();
    const root = await adapter.create({ title: "Epic 1", type: "epic", tier_prefix: "e" });
    e1Id = root.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates a child feature from a parent — infers 'f' prefix", async () => {
    const item = await adapter.create({ title: "Feature 1", type: "feature", parent_id: e1Id });
    assert.equal(item.id, `${e1Id}.f1`);
    assert.equal(item.parent_id, e1Id);
  });

  it("creates a second child feature — monotonically increments", async () => {
    const item = await adapter.create({ title: "Feature 2", type: "feature", parent_id: e1Id });
    assert.equal(item.id, `${e1Id}.f2`);
  });

  it("creates a task from a feature — infers 't' prefix", async () => {
    const item = await adapter.create({ title: "Task 1", type: "task", parent_id: `${e1Id}.f1` });
    assert.equal(item.id, `${e1Id}.f1.t1`);
    assert.equal(item.parent_id, `${e1Id}.f1`);
  });

  it("returned item has correct title and status", async () => {
    const item = await adapter.create({ title: "Feature 3", type: "feature", parent_id: e1Id });
    assert.equal(item.title, "Feature 3");
    assert.equal(item.status, "open");
    assert.equal(item.type, "feature");
  });

  it("item is persisted and readable via get()", async () => {
    const created = await adapter.create({
      title: "Persisted Feature",
      type: "feature",
      parent_id: e1Id,
    });
    const fetched = await adapter.get(created.id);
    assert.ok(fetched);
    assert.equal(fetched.title, "Persisted Feature");
    assert.equal(fetched.id, created.id);
  });
});

// ---------------------------------------------------------------------------
// MAX_DEPTH_EXCEEDED
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — MAX_DEPTH_EXCEEDED", () => {
  let dir, adapter, e1, e1f1, e1f1t1;

  before(async () => {
    dir = makeProject("unified-create-maxdepth-test");
    adapter = makeAdapter(dir);
    await adapter.init();
    const r = await adapter.create({ title: "Epic 1", type: "epic", tier_prefix: "e" });
    e1 = r.id;
    const f = await adapter.create({ title: "Feature 1", type: "feature", parent_id: e1 });
    e1f1 = f.id;
    const t = await adapter.create({ title: "Task 1", type: "task", parent_id: e1f1 });
    e1f1t1 = t.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws MAX_DEPTH_EXCEEDED when parent is at max tier depth", async () => {
    await assert.rejects(
      adapter.create({ title: "Sub-task", parent_id: e1f1t1 }),
      (err) => {
        assert.equal(err.code, "MAX_DEPTH_EXCEEDED");
        assert.ok(err.message.includes(e1f1t1));
        assert.ok(err.message.includes("max tier depth"));
        return true;
      }
    );
  });

  it("does NOT throw MAX_DEPTH_EXCEEDED for features (depth 2 of 3)", async () => {
    const item = await adapter.create({ title: "Another task", type: "task", parent_id: e1f1 });
    assert.ok(item.id.startsWith(`${e1f1}.t`));
  });

  it("allows deeper nesting when TierConfig is extended", async () => {
    const dir2 = makeProject("unified-create-extended-tier-test");
    try {
      const custom = makeAdapter(dir2, { e: "Epic", f: "Feature", t: "Task", s: "Subtask" });
      await custom.init();
      const r = await custom.create({ title: "Epic", type: "epic", tier_prefix: "e" });
      const f = await custom.create({ title: "Feature", type: "feature", parent_id: r.id });
      const t = await custom.create({ title: "Task", type: "task", parent_id: f.id });
      const sub = await custom.create({ title: "Subtask", parent_id: t.id });
      assert.match(sub.id, /\.s\d+$/);
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// PARENT_NOT_FOUND
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — PARENT_NOT_FOUND", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-create-parent-notfound-test");
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws PARENT_NOT_FOUND when parent_id does not exist", async () => {
    await assert.rejects(
      adapter.create({ title: "Orphan Feature", parent_id: "e99" }),
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

describe("JsonAdapter.create() — INVALID_TIER_PREFIX", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-create-invalid-prefix-test");
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws INVALID_TIER_PREFIX when explicit tier_prefix is not in TierConfig", async () => {
    await assert.rejects(
      adapter.create({ title: "Bad prefix", tier_prefix: "z" }),
      (err) => {
        assert.equal(err.code, "INVALID_TIER_PREFIX");
        assert.ok(err.message.includes("z"));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// ID_MISMATCH
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — ID_MISMATCH", () => {
  let dir, adapter, e1;

  before(async () => {
    dir = makeProject("unified-create-id-mismatch-test");
    adapter = makeAdapter(dir);
    await adapter.init();
    const r = await adapter.create({ title: "Epic 1", type: "epic", tier_prefix: "e" });
    e1 = r.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws ID_MISMATCH when explicit id has wrong prefix for parent_id", async () => {
    await assert.rejects(
      adapter.create({ title: "Mismatched", parent_id: e1, id: `${e1}.t999` }),
      (err) => err.code === "ID_MISMATCH"
    );
  });
});

// ---------------------------------------------------------------------------
// spec_ref field round-trip
// ---------------------------------------------------------------------------

describe("JsonAdapter — spec_ref field round-trip", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-create-specref-test");
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

  it("creates an issue without spec_ref — reads back as falsy", async () => {
    const item = await adapter.create({ title: "Feature without spec", type: "feature" });
    assert.ok(!item.spec_ref);
    const fetched = await adapter.get(item.id);
    assert.ok(!fetched.spec_ref);
  });

  it("spec_ref round-trips with planRef and spec_ref both set (they are distinct)", async () => {
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

  it("spec_ref round-trips for tiered items", async () => {
    const r = await adapter.create({ title: "Epic 5", type: "epic", tier_prefix: "e" });
    const item = await adapter.create({
      title: "Tiered feature with spec",
      type: "feature",
      parent_id: r.id,
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

describe("JsonAdapter.close() — unified cascade guard", () => {
  let dir, adapter, e10, e10f1;

  before(async () => {
    dir = makeProject("unified-close-cascade-test");
    adapter = makeAdapter(dir);
    await adapter.init();
    const r = await adapter.create({ title: "Epic 10", type: "epic", tier_prefix: "e" });
    e10 = r.id;
    const f = await adapter.create({ title: "Feature 1", type: "feature", parent_id: e10 });
    e10f1 = f.id;
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("throws CASCADE_BLOCKED when closing tiered parent with unclosed children", async () => {
    await assert.rejects(
      adapter.close(e10, "done"),
      (err) => {
        assert.equal(err.code, "CASCADE_BLOCKED");
        assert.ok(err.message.includes(e10f1));
        return true;
      }
    );
  });

  it("allows close when all children are closed", async () => {
    await adapter.close(e10f1, "done");
    const result = await adapter.close(e10, "done");
    assert.equal(result.status, "closed");
  });

  it("does NOT apply cascade guard to legacy flat IDs", async () => {
    const legacy = await adapter.create({ title: "Legacy flat", type: "task" });
    const result = await adapter.close(legacy.id, "done");
    assert.equal(result.status, "closed");
  });
});

// ---------------------------------------------------------------------------
// Deprecated wrappers: createEpic / updateEpic
// ---------------------------------------------------------------------------

describe("JsonAdapter — createEpic / updateEpic wrappers", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-deprecated-test");
    adapter = makeAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("createEpic() creates an epic with legacy epic-N ID", async () => {
    const epic = await adapter.createEpic({ title: "My Legacy Epic" });
    assert.match(epic.id, /^epic-\d+$/);
    assert.equal(epic.title, "My Legacy Epic");
  });

  it("updateEpic() updates an existing epic", async () => {
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
      assert.equal(warnCalled, false);
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
      assert.ok(warnings.length > 0);
      assert.ok(warnings.some((w) => w.includes("createEpic is deprecated")));
      assert.ok(warnings.some((w) => w.includes("create()")));
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
      warnings.length = 0;
      await adapter.updateEpic(epic.id, { milestone: "v2" });
      assert.ok(warnings.length > 0);
      assert.ok(warnings.some((w) => w.includes("updateEpic is deprecated")));
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
      assert.equal(warnCalled, false);
    } finally {
      console.warn = originalWarn;
      delete process.env.ADEV_DEPRECATION_WARN;
    }
  });
});

// ---------------------------------------------------------------------------
// spec_ref field validation
// ---------------------------------------------------------------------------

describe("validateIssue — spec_ref field", () => {
  let dir, adapter;

  before(async () => {
    dir = makeProject("unified-specref-validate-test");
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

  it("creates item without spec_ref — field is falsy", async () => {
    const item = await adapter.create({ title: "No spec_ref" });
    assert.ok(!item.spec_ref);
  });
});

// ---------------------------------------------------------------------------
// Custom tier config — tier inference with overrides
// ---------------------------------------------------------------------------

describe("JsonAdapter.create() — custom tier config inference", () => {
  it("infers next prefix from custom TierConfig order", async () => {
    const dir = makeProject("unified-create-custom-tier-test");
    try {
      const custom = makeAdapter(dir, { x: "Outcome", y: "Initiative", z: "Step" });
      await custom.init();
      const root = await custom.create({ title: "Outcome 1", tier_prefix: "x" });
      assert.match(root.id, /^x\d+$/);
      const child = await custom.create({ title: "Initiative 1", parent_id: root.id });
      assert.match(child.id, /^x\d+\.y\d+$/);
      const grandchild = await custom.create({ title: "Step 1", parent_id: child.id });
      assert.match(grandchild.id, /^x\d+\.y\d+\.z\d+$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
