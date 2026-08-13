import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("gaming-gate hook", () => {
  it("exits 0 for a non-test file", () => {
    const tmp = createTempDir();
    const target = `${tmp}/src/main.mjs`;
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: "it.skip('x', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) a Write that introduces a new violation, and the file is never written", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: "it.skip('x', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("allows an Edit that leaves a pre-existing violation untouched", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    writeFixture(tmp, "tests/foo.test.mjs", "it.skip('x', () => {});\n// old comment\n");
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "// old comment",
        CLAUDE_TOOL_INPUT_new_string: "// new comment",
      },
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "// old comment", new_string: "// new comment" } }),
    });
    assert.equal(result.exitCode, 0);
    const onDisk = readFileSync(target, "utf8");
    assert.equal(onDisk, "it.skip('x', () => {});\n// old comment\n");
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) an Edit that introduces a new violation, and the file is left untouched", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    writeFixture(tmp, "tests/foo.test.mjs", "// placeholder\n");
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "// placeholder",
        CLAUDE_TOOL_INPUT_new_string: "it.skip('x', () => {});",
      },
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "// placeholder", new_string: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 2);
    const onDisk = readFileSync(target, "utf8");
    assert.equal(onDisk, "// placeholder\n");
    cleanupTempDir(tmp);
  });

  it("exits 0 for the detector's own fixture file regardless of content", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/lib/test-strategies/gaming.test.mjs`;
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: { CLAUDE_TOOL_INPUT_file_path: target, CLAUDE_TOOL_INPUT_content: "it.skip('fixture', () => {});" },
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content: "it.skip('fixture', () => {});" } }),
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });

  it("blocks (exit 2) even when the introduced violation is in a file just over 500KB", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    const padding = "// x\n".repeat(150000); // > 500KB
    const content = padding + "\nit.skip('x', () => {});\n";
    // Deliberately stdin-only (no CLAUDE_TOOL_INPUT_* env overrides): a
    // >128KB single string in a spawned process's env block hits Linux's
    // MAX_ARG_STRLEN at execve() regardless of what the hook script itself
    // does (this is exactly the OS-level constraint gaming-gate.sh's own
    // temp-file relay works around for ITS downstream node spawn) — it's
    // not a real-mode invocation shape (stdin-JSON mode never sets these
    // env vars at spawn time; _parse-stdin.sh derives them via in-process
    // `eval`, not a fresh exec, so no length limit applies there). Passing
    // the same oversized string via `env` here would fail on Linux CI
    // runners even though macOS silently tolerates it, without exercising
    // anything about the gate's own no-size-cap guarantee (spec SEC-1).
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      stdin: JSON.stringify({ tool_name: "Write", tool_input: { file_path: target, content } }),
    });
    assert.equal(result.exitCode, 2);
    cleanupTempDir(tmp);
  });

  it("fails open (exit 0) when Edit's old_string is not found in the current content", () => {
    const tmp = createTempDir();
    const target = `${tmp}/tests/foo.test.mjs`;
    writeFixture(tmp, "tests/foo.test.mjs", "// placeholder\n");
    const result = runHook("gaming-gate.sh", {
      cwd: tmp,
      env: {
        CLAUDE_TOOL_INPUT_file_path: target,
        CLAUDE_TOOL_INPUT_old_string: "// does-not-exist",
        CLAUDE_TOOL_INPUT_new_string: "it.skip('x', () => {});",
      },
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: target, old_string: "// does-not-exist", new_string: "it.skip('x', () => {});" } }),
    });
    assert.equal(result.exitCode, 0);
    cleanupTempDir(tmp);
  });
});
