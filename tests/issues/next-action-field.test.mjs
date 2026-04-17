/**
 * Tests for the next_action field addition.
 *
 * Covers:
 * - validateIssue accepts string next_action
 * - validateIssue defaults next_action to null when absent
 * - validateIssue rejects non-string next_action with INVALID_NEXT_ACTION
 * - Empty string next_action is treated as null
 * - File adapter serializes next_action column in tasks.md
 * - File adapter reads next_action back on round-trip
 * - File adapter handles legacy rows without next_action column (null default)
 * - update() replaces next_action and advances updated timestamp
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

// ---------------------------------------------------------------------------
// validateIssue — next_action field validation
// ---------------------------------------------------------------------------

describe("validateIssue — next_action field", () => {
  it("defaults next_action to null when not provided", () => {
    const issue = validateIssue({ title: "No next action" });
    assert.equal(issue.next_action, null);
  });

  it("accepts a string next_action and preserves it", () => {
    const issue = validateIssue({ title: "Has next action", next_action: "Run /adev:specify --module foo" });
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
        assert.ok(err.message.includes("next_action must be a string when provided"));
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

  it("throws INVALID_NEXT_ACTION when next_action is an array", () => {
    assert.throws(
      () => validateIssue({ title: "Bad next action", next_action: [] }),
      (err) => err.code === "INVALID_NEXT_ACTION"
    );
  });

  it("throws INVALID_NEXT_ACTION when next_action is a boolean", () => {
    assert.throws(
      () => validateIssue({ title: "Bad next action", next_action: true }),
      (err) => err.code === "INVALID_NEXT_ACTION"
    );
  });

  it("accepts next_action with embedded newlines (multi-line string)", () => {
    const issue = validateIssue({ title: "Multi-line", next_action: "Step 1\nStep 2" });
    assert.equal(issue.next_action, "Step 1\nStep 2");
  });
});

// ---------------------------------------------------------------------------
// FileAdapter — next_action column read/write/round-trip
// ---------------------------------------------------------------------------

describe("FileAdapter — next_action column", () => {
  let dir, adapter;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "file-adapter-next-action-test-"));
    adapter = new FileAdapter(dir);
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

    // Small delay to ensure timestamp advances
    await new Promise((r) => setTimeout(r, 2));

    const updated = await adapter.update(issue.id, { next_action: "Run /adev:plan --spec foo.md" });
    assert.equal(updated.next_action, "Run /adev:plan --spec foo.md");
    assert.ok(updated.updated > originalUpdated, "updated timestamp should advance");
  });

  it("update() can clear next_action to null via empty string", async () => {
    const issue = await adapter.create({
      title: "Clear next action",
      next_action: "Run /adev:specify",
    });
    const updated = await adapter.update(issue.id, { next_action: null });
    assert.equal(updated.next_action, null);
  });

  it("serializes next_action column in tasks.md markdown table", async () => {
    const content = readFileSync(join(dir, ".context-index", "tasks", "tasks.md"), "utf8");
    assert.ok(content.includes("Next-Action"), "Header should include Next-Action column");
  });

  it("escapes newlines in next_action to spaces in markdown table", async () => {
    const issue = await adapter.create({
      title: "Newline next action",
      next_action: "Step 1\nStep 2",
    });
    const content = readFileSync(join(dir, ".context-index", "tasks", "tasks.md"), "utf8");
    // The table row must not contain raw newlines in the middle of a row
    // The value "Step 1 Step 2" (with space, not newline) should appear
    assert.ok(content.includes("Step 1 Step 2"), "Newlines should be escaped to spaces in table");

    // After round-trip read, next_action should have newlines replaced by spaces
    const fetched = await adapter.get(issue.id);
    assert.equal(fetched.next_action, "Step 1 Step 2", "Newlines are escaped to spaces in round-trip");
  });

  it("round-trip: all fields preserved across write/read cycle", async () => {
    const adapter2 = new FileAdapter(dir);
    const all = await adapter2.list({});
    for (const item of all) {
      // next_action should be present (string or null, never undefined)
      assert.ok(
        item.next_action === null || typeof item.next_action === "string",
        `next_action should be null or string, got ${typeof item.next_action} for ${item.id}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// FileAdapter — legacy rows without next_action column
// ---------------------------------------------------------------------------

describe("FileAdapter — legacy row compatibility (no next_action column)", () => {
  it("reads legacy tasks.md without next_action column — defaults to null", async () => {
    const dir = mkdtempSync(join(tmpdir(), "file-adapter-legacy-next-action-test-"));
    try {
      const adapter = new FileAdapter(dir);
      await adapter.init();

      // Write a legacy tasks.md manually with the OLD 12-column format (no next_action)
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

      const adapter2 = new FileAdapter(dir);
      const issues = await adapter2.list({});

      assert.equal(issues.length, 1, "Should read the legacy row");
      assert.equal(issues[0].id, "issue-1");
      assert.equal(issues[0].title, "Legacy Task");
      assert.equal(issues[0].next_action, null, "next_action should be null for legacy row");
      assert.equal(issues[0].notes, "old notes", "notes should still be read correctly");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
