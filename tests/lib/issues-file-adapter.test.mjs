/**
 * Tests for lib/issues/file-adapter.mjs (post-CON-5 read-only-deprecated mode).
 *
 * After the JSON-issue-board-adapter spec landed, FileAdapter's write methods
 * throw BACKEND_READ_ONLY_DEPRECATED. Reads continue to function. Tests below
 * cover the deprecation contract on every write method + the read paths that
 * still work. The legacy write-path coverage now lives in the parity suite
 * (`tests/lib/issues/json-adapter.parity.test.mjs`) which exercises the same
 * semantics against `JsonAdapter`.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

const FIXTURE_MD = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|
| epic-1 | Auth | open | plans/auth.md | 0.26.0 | 2026-01-01T00:00:00.000Z | 2026-01-02T00:00:00.000Z |

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | Fix login | open | 2 | bug | epic-1 |  |  |  |  |  |  | 2026-01-01T00:00:00.000Z | 2026-01-02T00:00:00.000Z |
| issue-2 | Add tests | open | 1 | task | epic-1 |  |  |  |  |  |  | 2026-01-01T00:00:00.000Z | 2026-01-02T00:00:00.000Z |
| issue-3 | Plan task | open | 2 | task |  | test-plan.md | 1 |  |  |  |  | 2026-01-01T00:00:00.000Z | 2026-01-02T00:00:00.000Z |
`;

function setupFixture() {
  const dir = mkdtempSync(join(tmpdir(), "file-adapter-test-"));
  const tasksDir = join(dir, ".context-index", "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, "tasks.md"), FIXTURE_MD);
  return dir;
}

describe("FileAdapter (read-only-deprecated mode)", () => {
  let dir, adapter;

  before(() => {
    dir = setupFixture();
    adapter = new FileAdapter(dir);
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  describe("reads continue to function", () => {
    it("list() returns all issues from the markdown fixture", async () => {
      const issues = await adapter.list({});
      assert.equal(issues.length, 3);
    });

    it("get() returns an issue by ID", async () => {
      const issue = await adapter.get("issue-1");
      assert.equal(issue.title, "Fix login");
      assert.equal(issue.type, "bug");
    });

    it("returns null for nonexistent ID", async () => {
      const result = await adapter.get("issue-999");
      assert.equal(result, null);
    });

    it("list() filters by status", async () => {
      const open = await adapter.list({ status: "open" });
      assert.equal(open.length, 3);
    });

    it("list() filters by type", async () => {
      const bugs = await adapter.list({ type: "bug" });
      assert.equal(bugs.length, 1);
      assert.equal(bugs[0].title, "Fix login");
    });

    it("list() sorts by priority then creation date", async () => {
      const issues = await adapter.list({});
      assert.equal(issues[0].id, "issue-2"); // priority 1
    });

    it("list() filters by planRef", async () => {
      const filtered = await adapter.list({ planRef: "test-plan.md" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].title, "Plan task");
      assert.equal(filtered[0].planTask, 1);
    });

    it("listEpics() returns epics", async () => {
      const epics = await adapter.listEpics({});
      assert.equal(epics.length, 1);
      assert.equal(epics[0].id, "epic-1");
    });

    it("listAll() returns all issues unsorted", async () => {
      const all = await adapter.listAll();
      assert.equal(all.length, 3);
    });

    it("walkTree() returns [] for legacy IDs", async () => {
      const tree = await adapter.walkTree("issue-1");
      assert.deepEqual(tree, []);
    });
  });

  describe("init() is a no-op (CON-5)", () => {
    it("does not produce a write", async () => {
      // init() should not throw even though writes are deprecated.
      await adapter.init();
    });
  });

  describe("write methods throw BACKEND_READ_ONLY_DEPRECATED", () => {
    const message =
      /file.*read-only|adev migrate|tasks\.backend: json/i;

    it("create() throws with the canonical advisory", async () => {
      await assert.rejects(
        adapter.create({ title: "x" }),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED" && message.test(err.message)
      );
    });

    it("update() throws", async () => {
      await assert.rejects(
        adapter.update("issue-1", { priority: 0 }),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("close() throws", async () => {
      await assert.rejects(
        adapter.close("issue-1", "done"),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("createEpic() throws", async () => {
      await assert.rejects(
        adapter.createEpic({ title: "x" }),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("updateEpic() throws", async () => {
      await assert.rejects(
        adapter.updateEpic("epic-1", { status: "in_progress" }),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("addDependency() throws", async () => {
      await assert.rejects(
        adapter.addDependency("issue-1", "issue-2"),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("createTiered() throws", async () => {
      await assert.rejects(
        adapter.createTiered({ id: "e1", title: "x" }),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });

    it("closeTiered() throws (delegates to close)", async () => {
      await assert.rejects(
        adapter.closeTiered("e1", "done"),
        (err) => err.code === "BACKEND_READ_ONLY_DEPRECATED"
      );
    });
  });

  describe("canonical deprecation message", () => {
    it("includes the `adev migrate` advisory and tasks.backend: json hint", async () => {
      try {
        await adapter.create({ title: "x" });
        assert.fail("expected throw");
      } catch (err) {
        assert.equal(err.code, "BACKEND_READ_ONLY_DEPRECATED");
        assert.ok(/adev migrate/i.test(err.message), `expected adev migrate hint: ${err.message}`);
        assert.ok(/tasks\.backend: json/i.test(err.message));
      }
    });
  });
});
