import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("context-read-tracker hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("sets flag when reading a .context-index/ file", () => {
    const { exitCode } = runHook("context-read-tracker.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/constitution.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("sets flag for nested .context-index/ paths", () => {
    const { exitCode } = runHook("context-read-tracker.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/specs/features/auth/charter.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("sets flag for absolute paths containing .context-index/", () => {
    const { exitCode } = runHook("context-read-tracker.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "/home/user/project/.context-index/manifest.yaml" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("does not set flag for non-context files", () => {
    const { exitCode } = runHook("context-read-tracker.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("does not set flag when no file path provided", () => {
    const { exitCode } = runHook("context-read-tracker.sh", {
      env: {},
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("outputs empty JSON", () => {
    const { stdout } = runHook("context-read-tracker.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/constitution.md" },
      cwd: tempDir,
    });
    assert.ok(stdout.includes("{}"));
  });
});
