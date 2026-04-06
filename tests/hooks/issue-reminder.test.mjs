import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("issue-reminder hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("exits 0 with {} when tasks.backend is not configured", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "project:\n  name: test\n");

    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});
  });

  it("increments counter on each invocation", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 25\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n");

    runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    const counterFile = join(tempDir, ".context-index", ".reminder-counter");
    assert.ok(existsSync(counterFile), "counter file should be created");
    assert.equal(readFileSync(counterFile, "utf8").trim(), "1");

    runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Edit" }),
    });

    assert.equal(readFileSync(counterFile, "utf8").trim(), "2");
  });

  it("resets counter and fires reminder when interval reached", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 2\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n| issue-1 | Test task | in_progress | 2 | task | | | | | | 2026-04-06 | 2026-04-06 |\n");

    // First call — counter goes to 1
    runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    // Second call — counter reaches 2 (interval), should trigger
    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Edit" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.hookSpecificOutput, "should have hookSpecificOutput");
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes("issue-1"), "should include issue ID");
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes("Test task"), "should include issue title");

    // Counter should be reset
    const counterFile = join(tempDir, ".context-index", ".reminder-counter");
    assert.equal(readFileSync(counterFile, "utf8").trim(), "0");
  });

  it("always triggers on git commit regardless of counter", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 100\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n| issue-2 | Commit task | in_progress | 1 | task | | | | | | 2026-04-06 | 2026-04-06 |\n");

    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: 'git commit -m "feat: add feature"' },
      }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.hookSpecificOutput, "should trigger on git commit");
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes("You just committed"), "should include commit message");
  });

  it("shows idle nudge with open issues when no in_progress issues", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 1\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n| issue-3 | Open task | open | 2 | task | | | | | | 2026-04-06 | 2026-04-06 |\n");

    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.hookSpecificOutput, "should fire nudge");
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes("No Active Work"), "should include idle nudge heading");
    assert.ok(ctx.includes("issue-3"), "should list open issue");
  });

  it("shows all-resolved nudge when no open or in_progress issues", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 1\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n| issue-4 | Done task | closed | 2 | task | | | | | | 2026-04-06 | 2026-04-06 |\n");

    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.hookSpecificOutput, "should fire nudge");
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes("All Issues Resolved"), "should show all-resolved");
  });

  it("handles missing counter file gracefully", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 25\n");
    writeFixture(tempDir, ".context-index/tasks/tasks.md", "## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|---|---|---|---|---|---|---|\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Deps | Notes | Created | Updated |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n");

    const { exitCode } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
  });

  it("exits 0 when reminder_interval is 0 (disabled)", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "tasks:\n  backend: file\n  reminder_interval: 0\n");

    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});

    // Counter should NOT be created
    const counterFile = join(tempDir, ".context-index", ".reminder-counter");
    assert.ok(!existsSync(counterFile), "counter should not be created when disabled");
  });

  it("always exits 0 and outputs valid JSON", () => {
    const { exitCode, stdout } = runHook("issue-reminder.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read" }),
    });

    assert.equal(exitCode, 0);
    JSON.parse(stdout.trim()); // should not throw
  });
});
