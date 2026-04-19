import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("context-preflight hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("allows edit when no file path is provided", () => {
    const { exitCode } = runHook("context-preflight.sh", {
      env: {},
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
  });

  it("allows edit to .context-index/ files without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/constitution.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("allows edit to test files without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/foo.test.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("allows edit to spec files without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/foo.spec.ts" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("allows edit to markdown files without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "README.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("allows edit to config files without flag", () => {
    const configs = ["package.json", "tsconfig.json", "jest.config.js", ".eslintrc.json", ".prettierrc"];
    for (const cfg of configs) {
      const { exitCode, stdout } = runHook("context-preflight.sh", {
        env: { CLAUDE_TOOL_INPUT_file_path: cfg },
        cwd: tempDir,
      });
      assert.equal(exitCode, 0, `Expected exit 0 for ${cfg}`);
      assert.ok(!stdout.includes("Context-First Reminder"), `Unexpected warning for ${cfg}`);
    }
  });

  it("allows edit to node_modules without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "node_modules/foo/index.js" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("allows edit to .claude-plugin/ files without flag", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".claude-plugin/plugin.json" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"));
  });

  it("warns when editing source code without context read", () => {
    // No .context-preflight-ok flag file
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0, "Should still allow (warn, not block)");
    assert.ok(stdout.includes("Context-First Reminder"), "Should include warning");
    assert.ok(stdout.includes("/adev:debug"), "Should mention debug skill");
  });

  it("allows source code edit when context was read (flag exists)", () => {
    // Create the flag file
    writeFixture(tempDir, ".context-index/.context-preflight-ok", "");

    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"), "Should not warn when flag exists");
  });

  it("warns for hook scripts edited without context read", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "hooks/my-hook.sh" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("Context-First Reminder"));
  });

  it("finds .context-preflight-ok via walk-up from subdirectory", () => {
    // Create .context-index at root with flag
    writeFixture(tempDir, ".context-index/.context-preflight-ok", "");
    // Create a subdirectory to simulate being deeper in the repo
    writeFixture(tempDir, "src/lib/.gitkeep", "");

    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/lib/parser.mjs" },
      cwd: `${tempDir}/src/lib`,
    });
    assert.equal(exitCode, 0);
    assert.ok(!stdout.includes("Context-First Reminder"), "Should find flag via walk-up");
  });

  it("warns for lib files edited without context read", () => {
    const { exitCode, stdout } = runHook("context-preflight.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "lib/utils/parser.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(stdout.includes("Context-First Reminder"));
  });
});
