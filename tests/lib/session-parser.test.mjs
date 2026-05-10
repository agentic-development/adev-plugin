import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, resolve, dirname } from "path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

import {
  resolveLogPath,
  parseSession,
  computeProjectHash,
} from "../../lib/session-parser.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PATH = resolve(__dirname, "..", "fixtures", "session-sample.jsonl");

describe("computeProjectHash", () => {
  it("returns a 16-char hex string", () => {
    const hash = computeProjectHash("/home/user/project");
    assert.equal(hash.length, 16);
    assert.match(hash, /^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    const a = computeProjectHash("/home/user/project");
    const b = computeProjectHash("/home/user/project");
    assert.equal(a, b);
  });

  it("differs for different inputs", () => {
    const a = computeProjectHash("/home/user/project-a");
    const b = computeProjectHash("/home/user/project-b");
    assert.notEqual(a, b);
  });

  it("matches raw SHA-256 prefix", () => {
    const input = "/some/path";
    const expected = createHash("sha256").update(input).digest("hex").slice(0, 16);
    assert.equal(computeProjectHash(input), expected);
  });
});

describe("resolveLogPath", () => {
  it("returns null for unknown agent", async () => {
    const result = await resolveLogPath("unknown-agent");
    assert.equal(result, null);
  });

  it("returns null for empty string agent", async () => {
    const result = await resolveLogPath("");
    assert.equal(result, null);
  });

  it("returns null when sessions directory does not exist", async () => {
    const result = await resolveLogPath("claude-code", {
      projectRoot: "/nonexistent/path/that/does/not/exist",
    });
    assert.equal(result, null);
  });

  it("computes path using deterministic hash of project root", async () => {
    // We verify the hash computation is consistent; actual file
    // resolution will fail (no real ~/.claude dir), returning null.
    const projectRoot = "/test/project/root";
    const hash = computeProjectHash(projectRoot);
    // The function should attempt to look in ~/.claude/projects/<hash>/sessions/
    // and return null since that path doesn't exist.
    const result = await resolveLogPath("claude-code", { projectRoot });
    assert.equal(result, null);
    // But the hash itself should be deterministic.
    assert.equal(hash, computeProjectHash(projectRoot));
  });
});

describe("parseSession", () => {
  it("returns structured metadata from the fixture", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    assert.notEqual(result, null);
    assert.ok(Array.isArray(result.messages));
    assert.ok(Array.isArray(result.filesModified));
    assert.ok(Array.isArray(result.toolCalls));
    assert.ok(typeof result.tokenUsage === "object");
    assert.ok(typeof result.tokenUsage.input === "number");
    assert.ok(typeof result.tokenUsage.output === "number");
  });

  it("extracts messages with role, turnIndex, timestamp but NO content", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    for (const msg of result.messages) {
      assert.ok(["user", "assistant"].includes(msg.role), `unexpected role: ${msg.role}`);
      assert.ok(typeof msg.turnIndex === "number");
      assert.ok("timestamp" in msg);
      // Content must NEVER be present.
      assert.equal(msg.content, undefined, "message content must not be included");
      assert.equal(msg.text, undefined, "message text must not be included");
    }
  });

  it("extracts the correct number of user and assistant messages", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    // The fixture has: 2 user messages, 3 assistant messages = 5 total
    // (the summary line is type "summary", not user/assistant)
    const userMsgs = result.messages.filter((m) => m.role === "user");
    const assistantMsgs = result.messages.filter((m) => m.role === "assistant");
    assert.equal(userMsgs.length, 2);
    assert.equal(assistantMsgs.length, 3);
  });

  it("extracts toolCalls with name and file path", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    assert.ok(result.toolCalls.length >= 2);

    const writeCall = result.toolCalls.find((tc) => tc.name === "Write");
    assert.ok(writeCall, "should find a Write tool call");
    assert.equal(writeCall.file, "/home/user/project/fib.js");

    const editCall = result.toolCalls.find((tc) => tc.name === "Edit");
    assert.ok(editCall, "should find an Edit tool call");
    assert.equal(editCall.file, "/home/user/project/fib.test.js");
  });

  it("extracts Bash tool call without file path", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    const bashCall = result.toolCalls.find((tc) => tc.name === "Bash");
    assert.ok(bashCall, "should find a Bash tool call");
    assert.equal(bashCall.file, undefined, "Bash tool call has no file");
  });

  it("extracts filesModified from tool inputs", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    assert.ok(result.filesModified.includes("/home/user/project/fib.js"));
    assert.ok(result.filesModified.includes("/home/user/project/fib.test.js"));
    // Bash commands should not add to filesModified.
    assert.equal(result.filesModified.length, 2);
  });

  it("accumulates token usage from assistant messages", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    // From fixture: 150+200+250 = 600 input, 80+60+30 = 170 output
    assert.equal(result.tokenUsage.input, 600);
    assert.equal(result.tokenUsage.output, 170);
  });

  it("does not include tool output content", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    // Verify there's no content field anywhere in the result.
    const json = JSON.stringify(result);
    assert.ok(!json.includes("File written successfully"), "tool output content must not appear");
    assert.ok(!json.includes("File edited successfully"), "tool output content must not appear");
    assert.ok(!json.includes("All assertions passed"), "tool output content must not appear");
  });

  it("does not include message text content", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    const json = JSON.stringify(result);
    assert.ok(!json.includes("implement the fibonacci"), "message content must not appear");
    assert.ok(!json.includes("looks good"), "message content must not appear");
  });

  it("skips malformed lines without crashing", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-test-"));
    const malformedPath = join(tmp, "malformed.jsonl");
    writeFileSync(
      malformedPath,
      [
        '{"type":"user","uuid":"u1","message":{"role":"user","content":[{"type":"text","text":"hello"}]},"timestamp":"2026-01-01T00:00:00Z"}',
        "this is not valid json {{{",
        "",
        '{"type":"assistant","uuid":"a1","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"timestamp":"2026-01-01T00:00:01Z","inputTokens":10,"outputTokens":5}',
      ].join("\n")
    );

    const result = await parseSession(malformedPath, "claude-code");
    assert.notEqual(result, null);
    assert.equal(result.messages.length, 2);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns null for missing file", async () => {
    const result = await parseSession("/nonexistent/file.jsonl", "claude-code");
    assert.equal(result, null);
  });

  it("returns null for unreadable file path", async () => {
    const result = await parseSession("/root/no-access/session.jsonl", "claude-code");
    assert.equal(result, null);
  });

  it("returns null when provider is 'none'", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code", {
      provider: "none",
    });
    assert.equal(result, null);
  });

  it("handles empty JSONL file gracefully", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "session-test-"));
    const emptyPath = join(tmp, "empty.jsonl");
    writeFileSync(emptyPath, "");

    const result = await parseSession(emptyPath, "claude-code");
    assert.notEqual(result, null);
    assert.equal(result.messages.length, 0);
    assert.equal(result.filesModified.length, 0);
    assert.equal(result.toolCalls.length, 0);
    assert.equal(result.tokenUsage.input, 0);
    assert.equal(result.tokenUsage.output, 0);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("assigns incrementing turnIndex values", async () => {
    const result = await parseSession(FIXTURE_PATH, "claude-code");
    for (let i = 0; i < result.messages.length; i++) {
      assert.equal(result.messages[i].turnIndex, i);
    }
  });
});
