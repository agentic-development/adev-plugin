import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, writeFixture, runHook } from "../helpers.mjs";

describe("session-capture hook", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("appends JSONL line when provider=native in stdin", () => {
    writeFixture(tempDir, ".context-index/.gitkeep", "");

    const { exitCode, stdout } = runHook("session-capture.sh", {
      env: {
        CLAUDE_TOOL_USE_NAME: "Edit",
        CLAUDE_TOOL_INPUT_file_path: "src/index.ts",
      },
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "native" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(existsSync(trackingFile), "tracking file should be created");

    const lines = readFileSync(trackingFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);

    const entry = JSON.parse(lines[0]);
    assert.equal(entry.tool, "Edit");
    assert.deepEqual(entry.files, ["src/index.ts"]);
    assert.deepEqual(entry.specs, []);
    assert.ok(entry.timestamp, "should have a timestamp");
  });

  it("appends JSONL when provider=native in manifest.yaml", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

    const { exitCode, stdout } = runHook("session-capture.sh", {
      env: {
        CLAUDE_TOOL_USE_NAME: "Bash",
      },
      cwd: tempDir,
      stdin: "{}",
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(existsSync(trackingFile), "tracking file should be created");

    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.equal(entry.tool, "Bash");
    assert.deepEqual(entry.files, []);
  });

  it("exits 0 with empty JSON when provider=none", () => {
    const { exitCode, stdout } = runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "none" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(!existsSync(trackingFile), "tracking file should NOT be created");
  });

  it("exits 0 with empty JSON when provider=entire", () => {
    const { exitCode, stdout } = runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "entire" }),
    });

    assert.equal(exitCode, 0);
    const parsed = JSON.parse(stdout.trim());
    assert.deepEqual(parsed, {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(!existsSync(trackingFile), "tracking file should NOT be created");
  });

  it("creates .context-index directory if missing", () => {
    // No .context-index directory at all
    const { exitCode } = runHook("session-capture.sh", {
      env: {
        CLAUDE_TOOL_USE_NAME: "Read",
        CLAUDE_TOOL_INPUT_file_path: "foo.txt",
      },
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "native" }),
    });

    assert.equal(exitCode, 0);

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(existsSync(trackingFile), "tracking file should be created in new directory");
  });

  it("appends multiple entries on successive calls", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

    runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_USE_NAME: "Edit", CLAUDE_TOOL_INPUT_file_path: "a.ts" },
      cwd: tempDir,
      stdin: "{}",
    });

    runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_USE_NAME: "Read", CLAUDE_TOOL_INPUT_file_path: "b.ts" },
      cwd: tempDir,
      stdin: "{}",
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const lines = readFileSync(trackingFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.tool, "Edit");
    assert.equal(second.tool, "Read");
  });
});
