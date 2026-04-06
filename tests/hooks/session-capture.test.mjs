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
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Edit",
        tool_input: { file_path: "src/index.ts" },
        session_id: "test-session-1",
      }),
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
    assert.equal(entry.session_id, "test-session-1");
    assert.ok(entry.timestamp, "should have a timestamp");
  });

  it("appends JSONL when provider=native in manifest.yaml", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

    const { exitCode, stdout } = runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      }),
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
      stdin: JSON.stringify({ provider: "none", tool_name: "Read" }),
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
      stdin: JSON.stringify({ provider: "entire", tool_name: "Edit" }),
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
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Read",
        tool_input: { file_path: "foo.txt" },
      }),
    });

    assert.equal(exitCode, 0);

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(existsSync(trackingFile), "tracking file should be created in new directory");
  });

  it("appends multiple entries on successive calls", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        tool_name: "Edit",
        tool_input: { file_path: "a.ts" },
      }),
    });

    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: "b.ts" },
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const lines = readFileSync(trackingFile, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.tool, "Edit");
    assert.deepEqual(first.files, ["a.ts"]);
    assert.equal(second.tool, "Read");
    assert.deepEqual(second.files, ["b.ts"]);
  });

  it("records tool_name as unknown when not provided", () => {
    const { exitCode } = runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "native" }),
    });

    assert.equal(exitCode, 0);

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.equal(entry.tool, "unknown");
    assert.deepEqual(entry.files, []);
  });
});
