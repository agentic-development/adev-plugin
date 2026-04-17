import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, writeFixture, runHook, PLUGIN_ROOT } from "../helpers.mjs";

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
      // Write a minimal skill file
      mkdirSync(join(tempDir, "skills", "using-adev"), { recursive: true });
      writeFileSync(join(tempDir, "skills", "using-adev", "SKILL.md"), "# Test Skill");

      // Write an active execution state in the cwd
      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.md"),
        "---\nstatus: active\nplanRef: .context-index/specs/features/test/test.plan.md\ncurrentTask: 2\nissueBinding: issue-5\nblockers: \nnextAction: Implement parser\nupdated: 2026-04-06T10:00:00Z\n---\n\n## Progress\n\n- [x] Task 1: Setup\n- [ ] Task 2: Implement parser\n- [ ] Task 3: Add tests\n"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("# Test Skill"), "should include skill content");
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
      mkdirSync(join(tempDir, "skills", "using-adev"), { recursive: true });
      writeFileSync(join(tempDir, "skills", "using-adev", "SKILL.md"), "# Test Skill");

      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.md"),
        "---\nstatus: blocked\nplanRef: \ncurrentTask: \nissueBinding: \nblockers: Missing API credentials\nnextAction: Ask user for credentials\nupdated: 2026-04-06T10:00:00Z\n---\n"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("# Test Skill"), "should include skill content");
      assert.ok(ctx.includes("blocked"), "should include blocked status");
      assert.ok(ctx.includes("Missing API credentials"), "should include blocker text");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("does not include resume block when execution state is idle", () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir, "skills", "using-adev"), { recursive: true });
      writeFileSync(join(tempDir, "skills", "using-adev", "SKILL.md"), "# Test Skill");

      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.md"),
        "---\nstatus: idle\nplanRef: \ncurrentTask: \nissueBinding: \nblockers: \nnextAction: \nupdated: 2026-04-06T10:00:00Z\n---\n"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("# Test Skill"), "should include skill content");
      assert.ok(!ctx.includes("Session Resume"), "should NOT include resume block for idle");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("does not include resume block when execution state file is missing", () => {
    const { exitCode, stdout } = runHook("session-start.sh", {
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(!ctx.includes("Session Resume"), "should NOT include resume block when file missing");
  });

  it("shows warning when execution state file is malformed", () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir, "skills", "using-adev"), { recursive: true });
      writeFileSync(join(tempDir, "skills", "using-adev", "SKILL.md"), "# Test Skill");

      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.md"),
        "this is not valid frontmatter"
      );

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project"),
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
      });

      assert.equal(exitCode, 0);
      const parsed = JSON.parse(stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(ctx.includes("# Test Skill"), "should include skill content");
      assert.ok(ctx.includes("missing or corrupt"), "should include malformed warning");
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  it("finds execution state via walk-up from subdirectory", () => {
    const tempDir = createTempDir();
    try {
      mkdirSync(join(tempDir, "skills", "using-adev"), { recursive: true });
      writeFileSync(join(tempDir, "skills", "using-adev", "SKILL.md"), "# Test Skill");

      // Write execution state at project root
      mkdirSync(join(tempDir, "project", ".context-index"), { recursive: true });
      writeFileSync(
        join(tempDir, "project", ".context-index", ".execution-state.md"),
        "---\nstatus: active\nplanRef: .context-index/specs/features/test/test.plan.md\ncurrentTask: 3\nissueBinding: issue-10\nblockers: \nnextAction: Write tests\nupdated: 2026-04-06T10:00:00Z\n---\n\n## Progress\n\n- [x] Task 1: Setup\n- [x] Task 2: Implement\n- [ ] Task 3: Write tests\n"
      );

      // Run from a subdirectory of the project
      mkdirSync(join(tempDir, "project", "src", "lib"), { recursive: true });

      const { exitCode, stdout } = runHook("session-start.sh", {
        cwd: join(tempDir, "project", "src", "lib"),
        env: { CLAUDE_PLUGIN_ROOT: tempDir },
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
