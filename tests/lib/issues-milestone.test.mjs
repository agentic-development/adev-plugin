/**
 * Integration tests for Epic milestone field across the issue management stack.
 *
 * Post-CON-5: write paths now go through `JsonAdapter`. The historical
 * `FileAdapter` write coverage is replaced by JsonAdapter equivalents below;
 * the remaining FileAdapter read-side test (legacy 6-column epic markdown)
 * exercises the parser delegation in read-only mode.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateEpic } from "../../lib/issues/interface.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

function makeJsonProject() {
  const dir = mkdtempSync(join(tmpdir(), "milestone-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

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

  describe("JsonAdapter milestone round-trip", () => {
    let dir, adapter;

    before(async () => {
      dir = makeJsonProject();
      adapter = new JsonAdapter(dir);
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

    it("creates epic without milestone — milestone is undefined", async () => {
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
  });

  describe("FileAdapter — read-only backward compatibility", () => {
    let dir, adapter;

    before(() => {
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
  });
});
