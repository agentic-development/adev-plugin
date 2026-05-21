import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTempDir, cleanupTempDir, runHook } from "../helpers.mjs";

const HOOK = "plan-body-write-guard.sh";

describe("plan-body-write-guard hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("allows Write to a non-plan file", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/src/index.ts`,
        CLAUDE_TOOL_INPUT_content: "**Routing:** auto-agent\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows Write to a `.spec.md` file even with the forbidden patterns in content", () => {
    // The plan-routing-sidecar spec itself documents these patterns in prose.
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.spec.md`,
        CLAUDE_TOOL_INPUT_content: "Detector flags `**Routing:**` blocks.\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows Write to a `.plan.md` with clean content", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_content: "# Plan: foo\n\n## Task 1\nDescription.\n",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("blocks Write to a `.plan.md` containing `**Routing:**`", () => {
    const { exitCode, stderr } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_content:
          "# Plan: foo\n\n## Task 1\n**Routing:** auto-agent (score: 19/20)\n",
      },
    });
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
    assert.match(stderr, /emit-sidecar/);
  });

  it("blocks Write to a `.plan.md` containing `**Scores:**`", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_content: "## Task 1\n**Scores:** spec=5 pattern=5\n",
      },
    });
    assert.equal(exitCode, 2);
  });

  it("blocks Write to a `.plan.md` containing `**Rationale:**`", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_content: "## Task 1\n**Rationale:** Pure pattern.\n",
      },
    });
    assert.equal(exitCode, 2);
  });

  it("blocks Edit to a `.plan.md` whose new_string introduces `**Routing:**`", () => {
    const { exitCode, stderr } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_old_string: "## Task 1\n",
        CLAUDE_TOOL_INPUT_new_string:
          "## Task 1\n**Routing:** auto-agent (score: 19/20)\n",
      },
    });
    assert.equal(exitCode, 2);
    assert.match(stderr, /BLOCKED/);
  });

  it("allows Edit to a `.plan.md` whose new_string strips inline blocks (delete-only)", () => {
    // old_string contains the forbidden pattern but new_string does not —
    // this is a legitimate stripping of legacy inline annotations.
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_old_string: "**Routing:** auto-agent\n",
        CLAUDE_TOOL_INPUT_new_string: "",
      },
    });
    assert.equal(exitCode, 0);
  });

  it("allows tool calls with no file_path", () => {
    const { exitCode } = runHook(HOOK, { env: {} });
    assert.equal(exitCode, 0);
  });

  it("matches via stdin JSON when env vars are not set (settings.json mode)", () => {
    // Plugin mode populates env vars; settings.json mode passes the
    // payload via stdin. The hook must handle both.
    const payload = JSON.stringify({
      tool_input: {
        file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        content: "## Task 1\n**Routing:** auto-agent\n",
      },
    });
    const { exitCode } = runHook(HOOK, { stdin: payload });
    assert.equal(exitCode, 2);
  });

  it("does not match `**Routing` without the closing `:**`", () => {
    const { exitCode } = runHook(HOOK, {
      env: {
        CLAUDE_TOOL_INPUT_file_path: `${tempDir}/.context-index/specs/x/foo.plan.md`,
        CLAUDE_TOOL_INPUT_content: "**Routing** is a concept discussed elsewhere.\n",
      },
    });
    assert.equal(exitCode, 0);
  });
});
