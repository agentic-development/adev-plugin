/**
 * Tests for lib/issues/file-adapter.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

describe("FileAdapter", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-test-"));
    adapter = new FileAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  describe("init", () => {
    it("creates tasks.md with empty tables", () => {
      const path = join(dir, ".context-index", "tasks", "tasks.md");
      assert.ok(existsSync(path));
      const content = readFileSync(path, "utf8");
      assert.ok(content.includes("# Issue Board"));
      assert.ok(content.includes("## Epics"));
      assert.ok(content.includes("## Issues"));
      assert.ok(content.includes("| ID |"));
    });
  });

  describe("issue CRUD", () => {
    it("creates an issue with auto-incremented ID", async () => {
      const issue = await adapter.create({ title: "Fix login bug", type: "bug" });
      assert.equal(issue.id, "issue-1");
      assert.equal(issue.status, "open");
      assert.equal(issue.priority, 2);
      assert.equal(issue.type, "bug");
      assert.equal(issue.title, "Fix login bug");
    });

    it("creates a second issue with incremented ID", async () => {
      const issue = await adapter.create({ title: "Add tests", type: "task", priority: 1 });
      assert.equal(issue.id, "issue-2");
      assert.equal(issue.priority, 1);
    });

    it("gets an issue by ID", async () => {
      const issue = await adapter.get("issue-1");
      assert.equal(issue.title, "Fix login bug");
      assert.equal(issue.type, "bug");
    });

    it("returns null for nonexistent ID", async () => {
      const result = await adapter.get("issue-999");
      assert.equal(result, null);
    });

    it("lists all issues", async () => {
      const issues = await adapter.list({});
      assert.ok(issues.length >= 2);
    });

    it("filters issues by status", async () => {
      const open = await adapter.list({ status: "open" });
      assert.ok(open.length >= 2);
      const closed = await adapter.list({ status: "closed" });
      assert.equal(closed.length, 0);
    });

    it("filters issues by type", async () => {
      const bugs = await adapter.list({ type: "bug" });
      assert.equal(bugs.length, 1);
      assert.equal(bugs[0].title, "Fix login bug");
    });

    it("sorts by priority then creation date", async () => {
      const issues = await adapter.list({});
      // issue-2 has priority 1, issue-1 has priority 2
      assert.equal(issues[0].id, "issue-2");
      assert.equal(issues[1].id, "issue-1");
    });

    it("updates an issue", async () => {
      const updated = await adapter.update("issue-1", { priority: 0 });
      assert.equal(updated.priority, 0);
      assert.equal(updated.title, "Fix login bug"); // unchanged fields preserved
    });

    it("rejects update on closed issue", async () => {
      await adapter.close("issue-2", "done");
      await assert.rejects(
        adapter.update("issue-2", { priority: 1 }),
        (err) => err.code === "ISSUE_CLOSED"
      );
    });

    it("rejects setting status to closed via update", async () => {
      await assert.rejects(
        adapter.update("issue-1", { status: "closed" }),
        (err) => err.code === "USE_CLOSE_METHOD"
      );
    });

    it("rejects create without title", async () => {
      await assert.rejects(
        adapter.create({}),
        (err) => err.code === "MISSING_REQUIRED_FIELD"
      );
    });
  });

  describe("epic CRUD", () => {
    it("creates an epic", async () => {
      const epic = await adapter.createEpic({ title: "Auth Feature" });
      assert.equal(epic.id, "epic-1");
      assert.equal(epic.status, "open");
    });

    it("updates an epic", async () => {
      const updated = await adapter.updateEpic("epic-1", { status: "in_progress" });
      assert.equal(updated.status, "in_progress");
      assert.equal(updated.title, "Auth Feature");
    });

    it("rejects epic without title", async () => {
      await assert.rejects(
        adapter.createEpic({}),
        (err) => err.code === "MISSING_REQUIRED_FIELD"
      );
    });

    it("creates issues under an epic", async () => {
      const issue = await adapter.create({ title: "Login flow", type: "task", epicId: "epic-1" });
      assert.equal(issue.epicId, "epic-1");

      const epicIssues = await adapter.list({ epicId: "epic-1" });
      assert.equal(epicIssues.length, 1);
      assert.equal(epicIssues[0].title, "Login flow");
    });
  });

  describe("dependencies", () => {
    it("adds a dependency", async () => {
      const a = await adapter.create({ title: "Dep A", type: "task" });
      const b = await adapter.create({ title: "Dep B", type: "task" });
      await adapter.addDependency(b.id, a.id);

      const updated = await adapter.get(b.id);
      assert.ok(updated.dependencies.includes(a.id));
    });

    it("blocks close when dependency is open", async () => {
      const issues = await adapter.list({});
      const depB = issues.find((i) => i.title === "Dep B");
      await assert.rejects(
        adapter.close(depB.id, "done"),
        (err) => err.code === "BLOCKED_BY_DEPENDENCIES"
      );
    });

    it("detects circular dependency", async () => {
      const issues = await adapter.list({});
      const depA = issues.find((i) => i.title === "Dep A");
      const depB = issues.find((i) => i.title === "Dep B");
      await assert.rejects(
        adapter.addDependency(depA.id, depB.id),
        (err) => err.code === "CIRCULAR_DEPENDENCY"
      );
    });
  });

  describe("parse/serialize round-trip", () => {
    it("preserves all data across read/write cycles", async () => {
      const before = await adapter.list({});
      // Force a re-read from file
      const adapter2 = new FileAdapter(dir);
      const after = await adapter2.list({});
      assert.equal(before.length, after.length);
      for (let i = 0; i < before.length; i++) {
        assert.equal(before[i].id, after[i].id);
        assert.equal(before[i].title, after[i].title);
        assert.equal(before[i].status, after[i].status);
      }
    });

    it("produces readable markdown", () => {
      const content = readFileSync(join(dir, ".context-index", "tasks", "tasks.md"), "utf8");
      assert.ok(content.includes("Fix login bug"));
      assert.ok(content.includes("Auth Feature"));
      assert.ok(content.includes("| ID |"));
    });
  });

  describe("plan-ref filtering", () => {
    it("filters by planRef", async () => {
      await adapter.create({ title: "Plan task", type: "task", planRef: "test-plan.md", planTask: 1 });
      const filtered = await adapter.list({ planRef: "test-plan.md" });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].title, "Plan task");
      assert.equal(filtered[0].planTask, 1);
    });
  });
});
