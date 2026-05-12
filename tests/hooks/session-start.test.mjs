import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, runHook, PLUGIN_ROOT } from "../helpers.mjs";

/**
 * Helper: write a `.execution-state.json` fixture into a fixture project root,
 * also creating a minimal `.context-index/manifest.yaml` so the JSON helper's
 * path-containment defenses pass.
 */
function writeJsonStateFixture(projectRoot, state) {
  mkdirSync(join(projectRoot, ".context-index"), { recursive: true });
  writeFileSync(
    join(projectRoot, ".context-index", "manifest.yaml"),
    "project:\n  name: test\n"
  );
  writeFileSync(
    join(projectRoot, ".context-index", ".execution-state.json"),
    JSON.stringify(state) + "\n"
  );
}

describe("session-start hook", () => {
  it("outputs valid JSON with skill content", () => {
    const { exitCode, stdout } = runHook("session-start.sh", {
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });

    assert.equal(exitCode, 0);

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.length > 0,
      "additionalContext should contain skill content"
    );
  });

  it("exits 0 with no output when skill file is missing", () => {
    const tempDir = createTempDir();
    try {
      const { exitCode, stdout } = runHook("session-start.sh", {
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });

      assert.equal(exitCode, 0);
      assert.equal(stdout.trim(), "");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("includes resume block when execution state is active", () => {
    const tempDir = createTempDir();
    try {
      // Use the real plugin root so the helper hooks/_execution-state.mjs is
      // resolvable. The test fixture writes its execution state at <tempDir>/project.
      writeJsonStateFixture(join(tempDir, "project"), {
        status: "active",
        planRef: ".context-index/specs/features/test/test.plan.md",
        currentTask: 2,
        issueBinding: "issue-5",
        blockers: "",
        nextAction: "Implement parser",
        progress: [
          { task: "Task 1: Setup", done: true },
          { task: "Task 2: Implement parser", done: false },
          { task: "Task 3: Add tests", done: false },
        ],
        updated: "2026-04-06T10:00:00Z",
      });

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("Session Resume"), "should include resume block");
      assert.ok(ctx.includes("active"), "should include active status");
      assert.ok(ctx.includes("Task 2"), "should include current task");
      assert.ok(ctx.includes("Implement parser"), "should include next action");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("includes blocker alert when execution state is blocked", () => {
    const tempDir = createTempDir();
    try {
      writeJsonStateFixture(join(tempDir, "project"), {
        status: "blocked",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "Missing API credentials",
        nextAction: "Ask user for credentials",
        progress: [],
        updated: "2026-04-06T10:00:00Z",
      });

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("blocked"), "should include blocked status");
      assert.ok(ctx.includes("Missing API credentials"), "should include blocker text");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("does not include resume block when execution state is idle", () => {
    const tempDir = createTempDir();
    try {
      writeJsonStateFixture(join(tempDir, "project"), {
        status: "idle",
        planRef: "",
        currentTask: "",
        issueBinding: "",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-04-06T10:00:00Z",
      });

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(!ctx.includes("Session Resume"), "should NOT include resume block for idle");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("does not include resume block when execution state file is missing", () => {
    const tempDir = createTempDir();
    try {
      // Create a project dir with .context-index + manifest but NO state file
      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", "manifest.yaml"),
        "project:\n  name: test\n"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(!ctx.includes("Session Resume"), "should NOT include resume block when file missing");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("emits empty resume block when state file is malformed (silent failure)", () => {
    // Per spec: malformed JSON yields empty stdout in resume-block mode — the
    // helper does NOT inject a "missing or corrupt" warning into Claude's
    // context. (Behavior change vs. legacy YAML parser: SEC-3 hardening.)
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", "manifest.yaml"),
        "project:\n  name: test\n"
      );
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.json"),
        "this is not valid JSON"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(!ctx.includes("Session Resume"), "must NOT include resume block on malformed state");
      assert.ok(!ctx.includes("missing or corrupt"), "must NOT inject warning text on malformed state");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("finds execution state via walk-up from subdirectory", () => {
    const tempDir = createTempDir();
    try {
      writeJsonStateFixture(join(tempDir, "project"), {
        status: "active",
        planRef: ".context-index/specs/features/test/test.plan.md",
        currentTask: 3,
        issueBinding: "issue-10",
        blockers: "",
        nextAction: "Write tests",
        progress: [
          { task: "Task 1: Setup", done: true },
          { task: "Task 2: Implement", done: true },
          { task: "Task 3: Write tests", done: false },
        ],
        updated: "2026-04-06T10:00:00Z",
      });

      // Run from a subdirectory of the project
      mkdirSync(join(tempDir, "project", "src", "lib"), { recursive: true });

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project", "src", "lib"),
        env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("Session Resume"), "should find execution state via walk-up");
      assert.ok(ctx.includes("Task 3"), "should include current task from walk-up");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("always exits 0 even when node fails", () => {
    const { exitCode } = runHook("session-start.sh", {
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });

    assert.equal(exitCode, 0);
  });
});
