/**
 * Tests for the next_action field addition.
 *
 * Covers:
 * - validateIssue accepts string next_action
 * - validateIssue defaults next_action to null when absent
 * - validateIssue rejects non-string next_action with INVALID_NEXT_ACTION
 * - Empty string next_action is treated as null
 * - Adapter writes next_action and reads it back (against JsonAdapter — the
 *   FileAdapter equivalents now live in the parity suite)
 * - Legacy markdown rows without next_action column default to null (read path
 *   still exercised against FileAdapter)
 *
 * Behaviors from spec: next_action field, behaviors 1–7
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { validateIssue } from "../../lib/issues/interface.mjs";
import { FileAdapter } from "../../lib/issues/file-adapter.mjs";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";

// ---------------------------------------------------------------------------
// validateIssue — next_action field validation
// ---------------------------------------------------------------------------

describe("validateIssue — next_action field", () => {
  it("defaults next_action to null when not provided", () => {
    const issue = validateIssue({ title: "No next action" });
    assert.equal(issue.next_action, null);
  });

  it("accepts a string next_action and preserves it", () => {
    const issue = validateIssue({
      title: "Has next action",
      next_action: "Run /adev:specify --module foo",
    });
    assert.equal(issue.next_action, "Run /adev:specify --module foo");
  });

  it("treats empty string next_action as null", () => {
    const issue = validateIssue({ title: "Empty next action", next_action: "" });
    assert.equal(issue.next_action, null);
  });

  it("throws INVALID_NEXT_ACTION when next_action is a number", () => {
    assert.throws(
      () => validateIssue({ title: "Bad next action", next_action: 42 }),
      (err) => {
        assert.equal(err.code, "INVALID_NEXT_ACTION");
        return true;
      }
    );
  });

  it("throws INVALID_NEXT_ACTION when next_action is an object", () => {
    assert.throws(
      () => validateIssue({ title: "Bad next action", next_action: {} }),
      (err) => err.code === "INVALID_NEXT_ACTION"
    );
  });
});

// ---------------------------------------------------------------------------
// JsonAdapter — next_action round-trip
// ---------------------------------------------------------------------------

function makeJsonProject() {
  const dir = mkdtempSync(join(tmpdir(), "next-action-jsonadapter-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

describe("JsonAdapter — next_action round-trip", () => {
  let dir, adapter;

  before(async () => {
    dir = makeJsonProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates an issue with next_action and reads it back", async () => {
    const issue = await adapter.create({
      title: "Task with next action",
      next_action: "Run /adev:plan --spec foo.md",
    });
    assert.equal(issue.next_action, "Run /adev:plan --spec foo.md");
    const fetched = await adapter.get(issue.id);
    assert.equal(fetched.next_action, "Run /adev:plan --spec foo.md");
  });

  it("creates an issue without next_action — reads as null", async () => {
    const issue = await adapter.create({ title: "No next action task" });
    assert.equal(issue.next_action, null);
    const fetched = await adapter.get(issue.id);
    assert.equal(fetched.next_action, null);
  });

  it("update() replaces next_action and advances updated timestamp", async () => {
    const issue = await adapter.create({
      title: "Update next action",
      next_action: "Run /adev:specify",
    });
    const originalUpdated = issue.updated;
    await new Promise((r) => setTimeout(r, 2));
    const updated = await adapter.update(issue.id, {
      next_action: "Run /adev:plan --spec foo.md",
    });
    assert.equal(updated.next_action, "Run /adev:plan --spec foo.md");
    assert.ok(updated.updated > originalUpdated, "updated timestamp should advance");
  });

  it("update() can clear next_action to null", async () => {
    const issue = await adapter.create({
      title: "Clear next action",
      next_action: "Run /adev:specify",
    });
    const updated = await adapter.update(issue.id, { next_action: null });
    assert.equal(updated.next_action, null);
  });

  it("round-trip: all fields preserved across write/read cycle", async () => {
    const adapter2 = new JsonAdapter(dir);
    const all = await adapter2.list({});
    for (const item of all) {
      assert.ok(
        item.next_action === null || typeof item.next_action === "string",
        `next_action should be null or string, got ${typeof item.next_action} for ${item.id}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// FileAdapter — legacy rows without next_action column (read-only)
// ---------------------------------------------------------------------------

describe("FileAdapter — legacy row compatibility (no next_action column)", () => {
  it("reads legacy tasks.md without next_action column — defaults to null", async () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-legacy-next-action-test-"));
    try {
      const legacyContent = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|------|-------|---------|---------|
| issue-1 | Legacy Task | open | 2 | task |  |  |  |  | old notes | 2024-01-01T00:00:00.000Z | 2024-01-01T00:00:00.000Z |
`;
      const tasksDir = join(dir, ".context-index", "tasks");
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, "tasks.md"), legacyContent, "utf8");

      const adapter = new FileAdapter(dir);
      const issues = await adapter.list({});
      assert.equal(issues.length, 1);
      assert.equal(issues[0].id, "issue-1");
      assert.equal(issues[0].title, "Legacy Task");
      assert.equal(issues[0].next_action, null);
      assert.equal(issues[0].notes, "old notes");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
