import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("sync-trigger hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("outputs sync reminder for constitution edit", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "project_name: test\n");

    const { exitCode, stdout } = runHook("sync-trigger.sh", {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/constitution.md`,
      },
      cwd: tempDir,
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(
      parsed.hookSpecificOutput.additionalContext.includes("/adev-sync"),
      "additionalContext should mention /adev-sync"
    );
  });

  it("silent for non-constitution file", () => {
    const { exitCode, stdout } = runHook("sync-trigger.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.ts" },
      cwd: tempDir,
    });

    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "");
  });

  it("silent when no manifest exists", () => {
    // Constitution path but no manifest.yaml in cwd
    const { exitCode, stdout } = runHook("sync-trigger.sh", {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/constitution.md`,
      },
      cwd: tempDir,
    });

    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), "");
  });
});
