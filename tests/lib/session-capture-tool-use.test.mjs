/**
 * Tests for lib/session-capture.mjs::runToolUseCapture — the `tool-use`
 * capture path built in spec Migration Path step 5a.
 *
 * Spec: .context-index/specs/features/hooks/lifecycle-gate-consolidation.spec.md
 *
 * The deterministic scenarios below replay fixtures captured from the REAL
 * pre-refactor hooks/session-capture.sh inline-Node program (see
 * tests/fixtures/session-capture-tool-use-golden/scenarios.json). timestamp
 * and operator are normalized to placeholders in both the fixture and the
 * live result (they vary run-to-run / machine-to-machine); every other
 * field — including key INSERTION ORDER, asserted via Object.keys() — must
 * match byte-for-byte.
 *
 * Token-usage enrichment is exercised separately below (not sourced from a
 * shell fixture, since it depends on live session-file content): the tests
 * assert the CLAUDE_PLUGIN_ROOT gate, graceful degradation when no session
 * file exists, and — for the positive path — that entry.usage matches what
 * resolveSessionUsage()/computeCost() independently compute, with the
 * documented sub-key order.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createTempDir, cleanupTempDir, PLUGIN_ROOT } from "../helpers.mjs";
import { runToolUseCapture } from "../../lib/session-capture.mjs";
import { resolveSessionUsage } from "../../lib/session-file-reader.mjs";
import { readCursor } from "../../lib/token-cursor.mjs";
import { computeCost } from "../../lib/token-pricing.mjs";

const FIXTURE_PATH = join(
  PLUGIN_ROOT,
  "tests",
  "fixtures",
  "session-capture-tool-use-golden",
  "scenarios.json"
);
const FIXTURES = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function normalize(entry) {
  if (!entry) return entry;
  const keyOrder = Object.keys(entry);
  const value = { ...entry };
  if ("timestamp" in value) value.timestamp = "<TIMESTAMP>";
  if ("operator" in value) value.operator = "<OPERATOR>";
  return { keyOrder, value };
}

describe("runToolUseCapture — deterministic entry-schema byte-compatibility", () => {
  it("minimal: tool_name only, no file_path/session_id/execution-state", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { written, entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Bash", tool_input: { command: "npm test" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.equal(written, true);
    assert.deepEqual(normalize(entry), FIXTURES.minimal);
  });

  it("with file_path", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "src/index.ts" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.withFilePath);
  });

  it("with session_id (inserted between timestamp and operator)", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { entry } = await runToolUseCapture({
      payload: {
        provider: "native",
        tool_name: "Read",
        tool_input: { file_path: "b.ts" },
        session_id: "sess-123",
      },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.withSessionId);
  });

  it("active state, file backend, issue bound but no epic in board", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    // Execution state is read through lib/execution-state.mjs, which requires
    // a manifest before it will resolve a storage root — same precondition
    // session-capture's own validateCwd enforces in production.
    writeFileSync(
      join(tmp, ".context-index", "manifest.yaml"),
      "project:\n  name: test\ntasks:\n  backend: file\n",
    );
    writeFileSync(
      join(tmp, ".context-index", ".execution-state.json"),
      JSON.stringify({
        status: "active",
        planRef: "x.plan.md",
        currentTask: 1,
        issueBinding: "issue-42",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      })
    );
    const { entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.issueNoEpic);
  });

  it("active state, file backend, issue + epic present in tasks.md", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index", "tasks"), { recursive: true });
    writeFileSync(
      join(tmp, ".context-index", "manifest.yaml"),
      "project:\n  name: test\ntasks:\n  backend: file\n",
    );
    writeFileSync(
      join(tmp, ".context-index", ".execution-state.json"),
      JSON.stringify({
        status: "active",
        planRef: "x.plan.md",
        currentTask: 1,
        issueBinding: "issue-42",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      })
    );
    writeFileSync(join(tmp, ".context-index", "tasks", "tasks.md"), "### issue-42\nepicId: epic-7\nstatus: open\n");
    const { entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.issueWithEpicFileBackend);
  });

  it("active state, beads backend, no board to answer: issue stamped, epic omitted", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index", "tasks"), { recursive: true });
    writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "project:\n  name: test\ntasks:\n  backend: beads\n");
    writeFileSync(
      join(tmp, ".context-index", ".execution-state.json"),
      JSON.stringify({
        status: "active",
        planRef: "x.plan.md",
        currentTask: 1,
        issueBinding: "issue-9",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      })
    );
    // The issue→epic link lives in beads now; this project has no beads
    // workspace, so nothing can answer. The hook must still emit the entry it
    // does know about instead of throwing — the same degradation the removed
    // `.beads-map.json` read had when the file was absent.
    const { entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.issueBeadsEpicUnresolved);
  });

  it("active state, beads backend, beads has no answer, tasks.md fallback resolves epic", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index", "tasks"), { recursive: true });
    writeFileSync(join(tmp, ".context-index", "manifest.yaml"), "project:\n  name: test\ntasks:\n  backend: beads\n");
    writeFileSync(
      join(tmp, ".context-index", ".execution-state.json"),
      JSON.stringify({
        status: "active",
        planRef: "x.plan.md",
        currentTask: 1,
        issueBinding: "issue-11",
        blockers: "",
        nextAction: "",
        progress: [],
        updated: "2026-05-11T00:00:00Z",
      })
    );
    writeFileSync(
      join(tmp, ".context-index", "tasks", "tasks.md"),
      "### issue-11\nepicId: epic-fallback\nstatus: open\n"
    );
    const { entry } = await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.deepEqual(normalize(entry), FIXTURES.issueWithEpicBeadsFallback);
  });

  it("provider != native: nothing written", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { written, entry } = await runToolUseCapture({
      payload: { provider: "none", tool_name: "Read" },
      projectRoot: tmp,
    });
    const trackingFile = join(tmp, ".context-index", ".session-tracking.jsonl");
    const fileExists = existsSync(trackingFile);
    cleanupTempDir(tmp);
    assert.equal(written, false);
    assert.equal(entry, null);
    assert.equal(fileExists, false);
  });

  it("missing tool_name: nothing written", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { written, entry } = await runToolUseCapture({
      payload: { provider: "native" },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.equal(written, false);
    assert.equal(entry, null);
  });

  it("appends to the JSONL file on disk with a trailing newline", async () => {
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    await runToolUseCapture({
      payload: { provider: "native", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
      projectRoot: tmp,
    });
    const trackingFile = join(tmp, ".context-index", ".session-tracking.jsonl");
    const raw = readFileSync(trackingFile, "utf8");
    cleanupTempDir(tmp);
    assert.ok(raw.endsWith("\n"));
    const parsed = JSON.parse(raw.trim());
    assert.equal(parsed.tool, "Edit");
  });
});

describe("runToolUseCapture — token-usage enrichment", () => {
  const savedPluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const cleanupDirs = [];

  afterEach(() => {
    if (savedPluginRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = savedPluginRoot;
    while (cleanupDirs.length) {
      const d = cleanupDirs.pop();
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("omits usage field when CLAUDE_PLUGIN_ROOT is not set", async () => {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { entry } = await runToolUseCapture({
      payload: {
        provider: "native",
        tool_name: "Edit",
        tool_input: { file_path: "src/index.ts" },
        session_id: "test-session-usage",
      },
      projectRoot: tmp,
    });
    cleanupTempDir(tmp);
    assert.equal(entry.usage, undefined);
  });

  it("degrades gracefully (no usage, cursor reset) when session file is missing", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT;
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });
    const { entry } = await runToolUseCapture({
      payload: {
        provider: "native",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        session_id: "nonexistent-session-xyz",
      },
      projectRoot: tmp,
    });
    const cursor = readCursor(tmp);
    cleanupTempDir(tmp);
    assert.equal(entry.usage, undefined);
    assert.ok(cursor, "cursor should have been reset/written even without a session file");
    assert.equal(cursor.session_id, "nonexistent-session-xyz");
  });

  it("populates usage with the documented sub-key order and matches independently-computed values", async () => {
    process.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT;
    const tmp = createTempDir();
    mkdirSync(join(tmp, ".context-index"), { recursive: true });

    const sessionId = "tool-use-capture-usage-test";
    const encoded = tmp.replace(/\//g, "-");
    const sessionDir = join(homedir(), ".claude", "projects", encoded);
    mkdirSync(sessionDir, { recursive: true });
    cleanupDirs.push(sessionDir);

    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 5 },
        },
      }),
    ];
    writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

    // Prime the cursor so the offset-0 read is treated as the active session
    // (not a reset) — mirrors what a prior tool-call invocation would leave.
    writeFileSync(
      join(tmp, ".context-index", ".token-cursor.json"),
      JSON.stringify({
        session_id: sessionId,
        last_offset: 0,
        cumulative: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0 },
        format_warning_emitted: false,
      })
    );

    const { entry } = await runToolUseCapture({
      payload: {
        provider: "native",
        tool_name: "Edit",
        tool_input: { file_path: "a.ts" },
        session_id: sessionId,
      },
      projectRoot: tmp,
    });

    // Independently compute the expected usage via the same underlying libs.
    const expectedUsage = resolveSessionUsage({ sessionId, projectDir: tmp, fromOffset: 0 });
    const expectedCost = computeCost(expectedUsage.model, {
      inputTokens: expectedUsage.inputTokens,
      outputTokens: expectedUsage.outputTokens,
      cacheReadTokens: expectedUsage.cacheReadTokens,
      cacheCreationTokens: expectedUsage.cacheCreationTokens,
    });

    cleanupTempDir(tmp);

    assert.ok(entry.usage, "usage field should be present");
    assert.deepEqual(Object.keys(entry.usage), [
      "input_tokens",
      "output_tokens",
      "cache_read_tokens",
      "cache_creation_tokens",
      "cost_usd",
    ]);
    assert.equal(entry.usage.input_tokens, expectedUsage.inputTokens);
    assert.equal(entry.usage.output_tokens, expectedUsage.outputTokens);
    assert.equal(entry.usage.cache_read_tokens, expectedUsage.cacheReadTokens);
    assert.equal(entry.usage.cache_creation_tokens, expectedUsage.cacheCreationTokens);
    assert.equal(entry.usage.cost_usd, expectedCost);
  });
});
