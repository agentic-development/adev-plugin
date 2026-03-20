import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("constitution-linter hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  /** Build a valid constitution with all 6 required sections. */
  function validConstitution(extraLines = 0) {
    const sections = [
      "## Identity",
      "We build things.",
      "",
      "## Non-Negotiable Principles",
      "Be good.",
      "",
      "## Coding Standards",
      "Write tests.",
      "",
      "## Architecture Boundaries",
      "No spaghetti.",
      "",
      "## Context Routing",
      "See specs.",
      "",
      "## Quality Gates",
      "All tests pass.",
    ];
    // Add extra lines to test the line-count limit
    for (let i = 0; i < extraLines; i++) {
      sections.push(`Extra line ${i}`);
    }
    return sections.join("\n") + "\n";
  }

  it("allows edit to non-constitution file", () => {
    const { exitCode } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.ts" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
  });

  it("allows valid constitution", () => {
    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    writeFixture(tempDir, ".context-index/constitution.md", validConstitution());

    const { exitCode } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
  });

  it("blocks constitution over max lines", () => {
    // Default max is 200. Create a 250-line file.
    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    writeFixture(tempDir, ".context-index/constitution.md", validConstitution(235));

    const { exitCode, stderr } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("lines"), "stderr should mention line count");
  });

  it("blocks missing required section", () => {
    // Constitution missing "## Quality Gates"
    const content = [
      "## Identity",
      "We build things.",
      "## Non-Negotiable Principles",
      "Be good.",
      "## Coding Standards",
      "Write tests.",
      "## Architecture Boundaries",
      "No spaghetti.",
      "## Context Routing",
      "See specs.",
    ].join("\n") + "\n";

    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    writeFixture(tempDir, ".context-index/constitution.md", content);

    const { exitCode, stderr } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
    assert.ok(stderr.includes("Quality Gates"), "stderr should mention the missing section");
  });

  it("respects custom max_lines from manifest", () => {
    // Manifest sets max to 300, file is 250 lines — should pass
    writeFixture(tempDir, ".context-index/manifest.yaml", "max_constitution_lines: 300\n");
    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    writeFixture(tempDir, ".context-index/constitution.md", validConstitution(235));

    const { exitCode } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
  });

  it("allows new file creation (file does not exist yet)", () => {
    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    // Do NOT create the file — simulates a new-file edit

    const { exitCode } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
  });

  it("reports multiple errors", () => {
    // Missing 2 sections AND over line limit
    const lines = ["## Identity", "We build things."];
    // Add enough lines to exceed 200
    for (let i = 0; i < 200; i++) {
      lines.push(`Line ${i}`);
    }
    const content = lines.join("\n") + "\n";

    const constitutionPath = `${tempDir}/.context-index/constitution.md`;
    writeFixture(tempDir, ".context-index/constitution.md", content);

    const { exitCode, stderr } = runHook("constitution-linter.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: constitutionPath },
      cwd: tempDir,
    });
    assert.equal(exitCode, 2);
    // Should mention line count AND at least one missing section
    assert.ok(stderr.includes("lines"), "stderr should mention line count");
    assert.ok(stderr.includes("Missing required section"), "stderr should mention missing sections");
  });
});
