/**
 * Parameterized parity suite for `JsonAdapter` vs the historical
 * `FileAdapter` write semantics.
 *
 * After CON-5, `FileAdapter` is read-only-deprecated, so this suite asserts
 * that the new `JsonAdapter` exhibits the same operational semantics that the
 * old `FileAdapter` did for the standard read/write flow:
 *
 *   - CRUD round-trip
 *   - dependency cycle detection
 *   - cascade-aware close on tiered IDs
 *   - filter parity on list()
 *
 * The legacy-issue read tolerance (CON-3) and the new granularity-invariant
 * rejection (SA-2) are both covered by `json-adapter.test.mjs` — they are
 * intentionally NOT replayed here because the FileAdapter equivalents have
 * been removed.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "json-adapter-parity-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

// ---------------------------------------------------------------------------
// CRUD round-trip parity (used to live in FileAdapter test suite)
// ---------------------------------------------------------------------------

describe("parity — CRUD round-trip", () => {
  let dir, adapter;
  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates issues with auto-incremented IDs (legacy issue-N)", async () => {
    const a = await adapter.create({ title: "First", type: "bug" });
    const b = await adapter.create({ title: "Second", type: "task", priority: 1 });
    assert.equal(a.id, "issue-1");
    assert.equal(b.id, "issue-2");
  });

  it("retrieves by ID", async () => {
    const got = await adapter.get("issue-1");
    assert.equal(got.title, "First");
    assert.equal(got.type, "bug");
  });

  it("returns null for missing ID", async () => {
    assert.equal(await adapter.get("issue-999"), null);
  });

  it("lists all issues", async () => {
    const all = await adapter.list({});
    assert.equal(all.length, 2);
  });

  it("filters by status", async () => {
    const open = await adapter.list({ status: "open" });
    assert.ok(open.length >= 2);
  });

  it("filters by type", async () => {
    const bugs = await adapter.list({ type: "bug" });
    assert.equal(bugs.length, 1);
    assert.equal(bugs[0].title, "First");
  });

  it("sorts by priority then creation date", async () => {
    const all = await adapter.list({});
    // issue-2 has priority 1, issue-1 has priority 2 (default).
    assert.equal(all[0].id, "issue-2");
    assert.equal(all[1].id, "issue-1");
  });

  it("updates fields and preserves untouched ones", async () => {
    const updated = await adapter.update("issue-1", { priority: 0 });
    assert.equal(updated.priority, 0);
    assert.equal(updated.title, "First");
    assert.equal(updated.type, "bug");
  });

  it("rejects USE_CLOSE_METHOD when status: closed is passed to update", async () => {
    await assert.rejects(
      adapter.update("issue-2", { status: "closed" }),
      (err) => err.code === "USE_CLOSE_METHOD"
    );
  });

  it("close() advances status to closed and appends to notes", async () => {
    const closed = await adapter.close("issue-2", "done");
    assert.equal(closed.status, "closed");
    assert.match(closed.notes, /Closed: done/);
  });

  it("rejects update on a closed issue (ISSUE_CLOSED)", async () => {
    await assert.rejects(
      adapter.update("issue-2", { priority: 0 }),
      (err) => err.code === "ISSUE_CLOSED"
    );
  });
});

// ---------------------------------------------------------------------------
// Dependency parity
// ---------------------------------------------------------------------------

describe("parity — dependencies", () => {
  let dir, adapter;
  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("adds a dependency", async () => {
    const a = await adapter.create({ title: "Dep A", type: "task" });
    const b = await adapter.create({ title: "Dep B", type: "task" });
    await adapter.addDependency(b.id, a.id);
    const got = await adapter.get(b.id);
    assert.ok(got.dependencies.includes(a.id));
  });

  it("blocks close when dependency is open (BLOCKED_BY_DEPENDENCIES)", async () => {
    const all = await adapter.list({});
    const depB = all.find((i) => i.title === "Dep B");
    await assert.rejects(
      adapter.close(depB.id, "done"),
      (err) => err.code === "BLOCKED_BY_DEPENDENCIES"
    );
  });

  it("detects circular dependency", async () => {
    const all = await adapter.list({});
    const depA = all.find((i) => i.title === "Dep A");
    const depB = all.find((i) => i.title === "Dep B");
    await assert.rejects(
      adapter.addDependency(depA.id, depB.id),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });
});

// ---------------------------------------------------------------------------
// Cascade-close parity (tiered IDs)
// ---------------------------------------------------------------------------

describe("parity — cascade close on tiered IDs", () => {
  let dir, adapter;
  before(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("blocks close of tiered parent with unclosed child (CASCADE_BLOCKED)", async () => {
    const root = await adapter.create({ title: "Root", type: "task", tier_prefix: "e" });
    await adapter.create({ title: "Child", type: "task", parent_id: root.id });
    await assert.rejects(
      adapter.close(root.id, "done"),
      (err) => err.code === "CASCADE_BLOCKED"
    );
  });

  it("allows close once all children are closed", async () => {
    const root = await adapter.create({ title: "Root B", type: "task", tier_prefix: "e" });
    const child = await adapter.create({ title: "Child B", type: "task", parent_id: root.id });
    await adapter.close(child.id, "done");
    const closed = await adapter.close(root.id, "done");
    assert.equal(closed.status, "closed");
  });

  it("does not apply cascade guard to legacy flat IDs", async () => {
    const legacy = await adapter.create({ title: "Legacy", type: "task" });
    const closed = await adapter.close(legacy.id, "done");
    assert.equal(closed.status, "closed");
  });
});

// ---------------------------------------------------------------------------
// Round-trip persistence (re-instantiate adapter, verify state)
// ---------------------------------------------------------------------------

describe("parity — persistence round-trip", () => {
  let dir;
  before(() => { dir = makeProject(); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("survives an adapter restart", async () => {
    const adapter1 = new JsonAdapter(dir);
    await adapter1.init();
    await adapter1.create({ title: "Persisted", type: "task" });

    const adapter2 = new JsonAdapter(dir);
    const all = await adapter2.list({});
    assert.equal(all.length, 1);
    assert.equal(all[0].title, "Persisted");
  });
});
