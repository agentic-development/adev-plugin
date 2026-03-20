import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
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
});
