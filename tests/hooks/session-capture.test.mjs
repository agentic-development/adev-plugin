import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createTempDir, cleanupTempDir, writeFixture, runHook, PLUGIN_ROOT } from "../helpers.mjs";

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

  it("does not write entry when tool_name is missing", () => {
    const { exitCode } = runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ provider: "native" }),
    });

    assert.equal(exitCode, 0);

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(!existsSync(trackingFile), "should NOT write when tool_name missing");
  });

  it("does not include specs field in JSONL output", () => {
    writeFixture(tempDir, ".context-index/.gitkeep", "");

    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Read",
        tool_input: { file_path: "foo.txt" },
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.equal(entry.specs, undefined, "specs field should not be present");
  });

  it("timestamp is ISO 8601 UTC truncated to seconds", () => {
    writeFixture(tempDir, ".context-index/.gitkeep", "");
    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("session_id is omitted when not provided", () => {
    writeFixture(tempDir, ".context-index/.gitkeep", "");
    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Read",
        tool_input: { file_path: "foo.txt" },
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.ok(!("session_id" in entry), "session_id should be omitted, not null");
  });

  it("files is always an array even when no file_path", () => {
    writeFixture(tempDir, ".context-index/.gitkeep", "");
    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Bash",
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.ok(Array.isArray(entry.files), "files should be an array");
    assert.equal(entry.files.length, 0);
  });

  it("each line is valid independent JSON", () => {
    writeFixture(tempDir, ".context-index/manifest.yaml", "provider: native\n");

    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "a.ts" } }),
    });
    runHook("session-capture.sh", {
      cwd: tempDir,
      stdin: JSON.stringify({ tool_name: "Read", tool_input: { file_path: "b.ts" } }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const lines = readFileSync(trackingFile, "utf8").trim().split("\n");
    for (const line of lines) {
      const entry = JSON.parse(line);
      assert.ok(entry.tool, "tool field required");
      assert.ok(Array.isArray(entry.files), "files field required");
      assert.ok(entry.timestamp, "timestamp field required");
    }
  });

  it("omits usage field when CLAUDE_PLUGIN_ROOT is not set", () => {
    // When CLAUDE_PLUGIN_ROOT env var is absent, enrichment block is skipped
    // and the entry should not have a usage field.
    writeFixture(tempDir, ".context-index/.gitkeep", "");

    const { exitCode, stdout } = runHook("session-capture.sh", {
      cwd: tempDir,
      env: { CLAUDE_PLUGIN_ROOT: "" },
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Edit",
        tool_input: { file_path: "src/index.ts" },
        session_id: "test-session-usage",
      }),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.trim()), {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.equal(entry.usage, undefined, "usage field should be absent when CLAUDE_PLUGIN_ROOT not set");
  });

  it("exits 0 when CLAUDE_PLUGIN_ROOT is set but session files are missing (graceful degradation)", () => {
    // Even if CLAUDE_PLUGIN_ROOT is set to a valid plugin root, if there is no
    // Claude session file the enrichment block should degrade gracefully and
    // still write the entry without a usage field.
    writeFixture(tempDir, ".context-index/.gitkeep", "");

    const { exitCode, stdout } = runHook("session-capture.sh", {
      cwd: tempDir,
      env: { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        session_id: "nonexistent-session-xyz",
      }),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(stdout.trim()), {});

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    assert.ok(existsSync(trackingFile), "tracking file should still be created");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());
    assert.equal(entry.tool, "Bash");
    // usage may or may not be present — what matters is no crash and exit 0
  });

  it("backward compatibility — entry schema matches pre-enrichment shape when no usage data", () => {
    // Entries written without usage must have exactly: tool, files, timestamp,
    // and optionally session_id, operator, issue, epic.
    // No extra fields should appear.
    writeFixture(tempDir, ".context-index/.gitkeep", "");

    runHook("session-capture.sh", {
      cwd: tempDir,
      env: { CLAUDE_PLUGIN_ROOT: "" },
      stdin: JSON.stringify({
        provider: "native",
        tool_name: "Read",
        tool_input: { file_path: "foo.txt" },
        session_id: "compat-session",
      }),
    });

    const trackingFile = join(tempDir, ".context-index", ".session-tracking.jsonl");
    const entry = JSON.parse(readFileSync(trackingFile, "utf8").trim());

    // Core fields
    assert.equal(entry.tool, "Read");
    assert.deepEqual(entry.files, ["foo.txt"]);
    assert.match(entry.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(entry.session_id, "compat-session");

    // No unexpected fields
    const allowedKeys = new Set(["tool", "files", "timestamp", "session_id", "operator", "issue", "epic", "usage"]);
    for (const key of Object.keys(entry)) {
      assert.ok(allowedKeys.has(key), `unexpected field: ${key}`);
    }

    // usage absent since CLAUDE_PLUGIN_ROOT is empty
    assert.equal(entry.usage, undefined, "usage should be absent without CLAUDE_PLUGIN_ROOT");
  });
});

// Migrated verbatim from the deleted tests/hooks/context-read-tracker.test.mjs
// (spec Migration Path step 4 — context-read-tracker.sh folded into
// session-capture.sh's Read branch). Only the hook name under test changed;
// assertions and fixtures are unchanged, including the absence of
// `provider: native` — the .context-preflight-ok touch must fire
// unconditionally, independent of the JSONL-capture provider gate.
describe("session-capture hook — context-read-tracker fold-in (.context-preflight-ok)", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("sets flag when reading a .context-index/ file", () => {
    const { exitCode } = runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/constitution.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("sets flag for nested .context-index/ paths", () => {
    const { exitCode } = runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/specs/features/auth/charter.md" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("sets flag for absolute paths containing .context-index/", () => {
    const { exitCode } = runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "/home/user/project/.context-index/manifest.yaml" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("does not set flag for non-context files", () => {
    const { exitCode } = runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: "src/index.mjs" },
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("does not set flag when no file path provided", () => {
    const { exitCode } = runHook("session-capture.sh", {
      env: {},
      cwd: tempDir,
    });
    assert.equal(exitCode, 0);
    assert.ok(!existsSync(join(tempDir, ".context-index/.context-preflight-ok")));
  });

  it("outputs empty JSON", () => {
    const { stdout } = runHook("session-capture.sh", {
      env: { CLAUDE_TOOL_INPUT_file_path: ".context-index/constitution.md" },
      cwd: tempDir,
    });
    assert.ok(stdout.includes("{}"));
  });
});
