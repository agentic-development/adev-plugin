/**
 * Integration tests for Epic milestone field across the issue management stack.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateEpic } from "../../lib/issues/interface.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";

describe("Epic milestone support", () => {
  describe("validateEpic", () => {
    it("includes milestone when provided as string", () => {
      const epic = validateEpic({ title: "Auth Feature", milestone: "v1" });
      assert.equal(epic.milestone, "v1");
    });

    it("returns milestone undefined when not provided", () => {
      const epic = validateEpic({ title: "Auth Feature" });
      assert.equal(epic.milestone, undefined);
    });

    it("returns milestone undefined for empty string", () => {
      const epic = validateEpic({ title: "Auth Feature", milestone: "" });
      assert.equal(epic.milestone, undefined);
    });

    it("coerces non-string milestone to string", () => {
      const epic = validateEpic({ title: "Auth Feature", milestone: 42 });
      assert.equal(epic.milestone, "42");
    });
  });

  describe("FileAdapter milestone round-trip", () => {
    let dir, adapter;

    before(async () => {
      dir = mkdtempSync(join(tmpdir(), "milestone-test-"));
      adapter = new FileAdapter(dir);
      await adapter.init();
    });

    after(() => rmSync(dir, { recursive: true, force: true }));

    it("creates epic with milestone and reads it back", async () => {
      const epic = await adapter.createEpic({ title: "Release v1", milestone: "v1" });
      assert.equal(epic.milestone, "v1");

      const epics = await adapter.listEpics({});
      const found = epics.find((e) => e.id === epic.id);
      assert.equal(found.milestone, "v1");
    });

    it("creates epic without milestone, milestone is undefined", async () => {
      const epic = await adapter.createEpic({ title: "No milestone" });
      assert.equal(epic.milestone, undefined);

      const epics = await adapter.listEpics({});
      const found = epics.find((e) => e.id === epic.id);
      assert.equal(found.milestone, undefined);
    });

    it("updates epic milestone", async () => {
      const epic = await adapter.createEpic({ title: "Evolving", milestone: "v1" });
      const updated = await adapter.updateEpic(epic.id, { milestone: "v2" });
      assert.equal(updated.milestone, "v2");

      const epics = await adapter.listEpics({});
      const found = epics.find((e) => e.id === epic.id);
      assert.equal(found.milestone, "v2");
    });

    it("filters epics by milestone", async () => {
      const v1Epics = await adapter.listEpics({ milestone: "v1" });
      assert.ok(v1Epics.length >= 1);
      for (const e of v1Epics) {
        assert.equal(e.milestone, "v1");
      }
    });

    it("returns empty array when filtering by non-existent milestone", async () => {
      const result = await adapter.listEpics({ milestone: "v99" });
      assert.equal(result.length, 0);
    });

    it("serializes tasks.md with Milestone column header", async () => {
      const path = join(dir, ".context-index", "tasks", "tasks.md");
      const content = readFileSync(path, "utf8");
      assert.ok(content.includes("| Milestone |"), "tasks.md should contain Milestone column");
    });
  });

  describe("backward compatibility", () => {
    let dir, adapter;

    before(async () => {
      dir = mkdtempSync(join(tmpdir(), "milestone-compat-test-"));
      const tasksDir = join(dir, ".context-index", "tasks");
      mkdirSync(tasksDir, { recursive: true });

      // Write old-format tasks.md (6-column epics, no Milestone)
      const oldFormat = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Created | Updated |
|----|-------|--------|----------|---------|---------|
| epic-1 | Old Epic | open |  | 2026-01-01T00:00:00.000Z | 2026-01-01T00:00:00.000Z |

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|------|-------|---------|---------|
`;
      writeFileSync(join(tasksDir, "tasks.md"), oldFormat);

      adapter = new FileAdapter(dir);
    });

    after(() => rmSync(dir, { recursive: true, force: true }));

    it("reads old-format tasks.md without error", async () => {
      const epics = await adapter.listEpics({});
      assert.equal(epics.length, 1);
      assert.equal(epics[0].id, "epic-1");
      assert.equal(epics[0].title, "Old Epic");
    });

    it("old epics have milestone undefined", async () => {
      const epics = await adapter.listEpics({});
      assert.equal(epics[0].milestone, undefined);
    });

    it("re-serializes with 7-column Milestone header after write", async () => {
      // Trigger a write by creating a new epic
      await adapter.createEpic({ title: "New Epic", milestone: "v2" });

      const path = join(dir, ".context-index", "tasks", "tasks.md");
      const content = readFileSync(path, "utf8");
      assert.ok(content.includes("| Milestone |"), "Re-serialized file should have Milestone column");
    });

    it("old epic preserves data after re-serialization", async () => {
      const epics = await adapter.listEpics({});
      const oldEpic = epics.find((e) => e.id === "epic-1");
      assert.equal(oldEpic.title, "Old Epic");
      assert.equal(oldEpic.status, "open");
      assert.equal(oldEpic.milestone, undefined);
    });
  });
});
