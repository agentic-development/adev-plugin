/**
 * Tests for lib/session-file-reader.mjs
 *
 * TDD: Tests written first (RED), then implementation (GREEN).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  resolveSessionDir,
  resolveSessionUsage,
} from "../../lib/session-file-reader.mjs";

// ── resolveSessionDir ───────────────────────────────────────────────────────

describe("resolveSessionDir", () => {
  it("encodes project path by replacing all slashes with dashes", () => {
    const result = resolveSessionDir("/Users/foo/bar");
    const expected = join(homedir(), ".claude", "projects", "-Users-foo-bar");
    assert.equal(result, expected);
  });

  it("handles root-level paths", () => {
    const result = resolveSessionDir("/myproject");
    const expected = join(homedir(), ".claude", "projects", "-myproject");
    assert.equal(result, expected);
  });

  it("handles paths with many segments", () => {
    const result = resolveSessionDir("/a/b/c/d/e");
    const expected = join(homedir(), ".claude", "projects", "-a-b-c-d-e");
    assert.equal(result, expected);
  });

  it("is deterministic for the same input", () => {
    const a = resolveSessionDir("/Users/dpavancini/Development/adev-plugin");
    const b = resolveSessionDir("/Users/dpavancini/Development/adev-plugin");
    assert.equal(a, b);
  });

  it("differs for different project paths", () => {
    const a = resolveSessionDir("/project-a");
    const b = resolveSessionDir("/project-b");
    assert.notEqual(a, b);
  });
});

// ── resolveSessionUsage — happy path ────────────────────────────────────────

describe("resolveSessionUsage — happy path", () => {
  it("returns cumulative usage from a valid session file with multiple assistant entries", () => {
    const tmp = createTempDir();
    try {
      // Simulate the ~/.claude/projects/<encoded>/<session-id>.jsonl structure
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-happy";
      const lines = [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "hello" },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_read_input_tokens: 200,
              cache_creation_input_tokens: 10,
            },
          },
        }),
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "again" },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-sonnet-4-6",
            usage: {
              input_tokens: 300,
              output_tokens: 120,
              cache_read_input_tokens: 400,
              cache_creation_input_tokens: 20,
            },
          },
        }),
      ];

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

      const result = resolveSessionUsage({ sessionId, projectDir });

      assert.ok(result !== null, "expected non-null result");
      assert.equal(result.inputTokens, 400, "input_tokens should be summed");
      assert.equal(result.outputTokens, 170, "output_tokens should be summed");
      assert.equal(result.cacheReadTokens, 600, "cache_read_input_tokens should be summed");
      assert.equal(result.cacheCreationTokens, 30, "cache_creation_input_tokens should be summed");
      // Model should be from the LAST assistant entry
      assert.equal(result.model, "claude-sonnet-4-6", "model should be from last assistant entry");
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns model from the last assistant entry", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-model";
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-haiku-3-5",
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-opus-4-6",
            usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        }),
      ];

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.ok(result !== null);
      assert.equal(result.model, "claude-opus-4-6");
      assert.equal(result.inputTokens, 30);
      assert.equal(result.outputTokens, 15);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns zeros for missing optional usage fields", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-partial";
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 50,
              output_tokens: 25,
              // cache_read_input_tokens and cache_creation_input_tokens absent
            },
          },
        }),
      ];

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n"));

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.ok(result !== null);
      assert.equal(result.inputTokens, 50);
      assert.equal(result.outputTokens, 25);
      assert.equal(result.cacheReadTokens, 0);
      assert.equal(result.cacheCreationTokens, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── resolveSessionUsage — failure modes ─────────────────────────────────────

describe("resolveSessionUsage — failure modes", () => {
  it("returns null when the session file does not exist", () => {
    const tmp = createTempDir();
    try {
      const result = resolveSessionUsage({
        sessionId: "nonexistent-session-id-xyz",
        projectDir: tmp,
      });
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for an empty session file", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-empty";
      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), "");

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null when all lines are malformed JSON", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-malformed";
      writeFileSync(
        join(sessionDir, `${sessionId}.jsonl`),
        "not json at all\n{{{ broken }\nstill bad\n"
      );

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null when there are no assistant entries", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-no-assistant";
      const lines = [
        JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
        JSON.stringify({ type: "summary", summary: "some summary" }),
      ];

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("skips malformed lines and processes valid ones", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-mixed";
      const lines = [
        "this is bad json{",
        JSON.stringify({
          type: "assistant",
          message: {
            model: "claude-opus-4-6",
            usage: {
              input_tokens: 77,
              output_tokens: 33,
              cache_read_input_tokens: 0,
              cache_creation_input_tokens: 0,
            },
          },
        }),
        "{{{ also bad",
      ];

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), lines.join("\n") + "\n");

      const result = resolveSessionUsage({ sessionId, projectDir });
      assert.ok(result !== null, "should process valid lines even if some are malformed");
      assert.equal(result.inputTokens, 77);
      assert.equal(result.outputTokens, 33);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null when projectDir is a non-existent path (no session dir)", () => {
    const result = resolveSessionUsage({
      sessionId: "some-session",
      projectDir: "/this/path/absolutely/does/not/exist/ever",
    });
    assert.equal(result, null);
  });
});

// ── resolveSessionUsage — fromOffset ────────────────────────────────────────

describe("resolveSessionUsage — fromOffset", () => {
  it("reads from byte offset (skips earlier data when offset is provided)", () => {
    const tmp = createTempDir();
    try {
      const projectDir = tmp;
      const encoded = projectDir.replace(/\//g, "-");
      const sessionDir = join(homedir(), ".claude", "projects", encoded);
      mkdirSync(sessionDir, { recursive: true });

      const sessionId = "test-session-offset";

      // First entry to be skipped via offset
      const line1 = JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-haiku-3-5",
          usage: { input_tokens: 999, output_tokens: 999, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }) + "\n";

      // Second entry — should be read when offset skips line1
      const line2 = JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          usage: { input_tokens: 5, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }) + "\n";

      writeFileSync(join(sessionDir, `${sessionId}.jsonl`), line1 + line2);

      // Offset past line1
      const offset = Buffer.byteLength(line1, "utf8");
      const result = resolveSessionUsage({ sessionId, projectDir, fromOffset: offset });
      assert.ok(result !== null);
      assert.equal(result.inputTokens, 5, "should only count tokens after the offset");
      assert.equal(result.outputTokens, 3);
      assert.equal(result.model, "claude-opus-4-6");
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
