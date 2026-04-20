/**
 * Tests for lib/token-cursor.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import {
  CURSOR_FILE,
  readCursor,
  writeCursor,
  resetCursor,
} from "../../lib/token-cursor.mjs";

// ── CURSOR_FILE constant ────────────────────────────────────────────────────

describe("CURSOR_FILE", () => {
  it("is the expected relative path", () => {
    assert.equal(CURSOR_FILE, ".context-index/.token-cursor.json");
  });
});

// ── readCursor ──────────────────────────────────────────────────────────────

describe("readCursor", () => {
  it("returns null when file does not exist", () => {
    const tmp = createTempDir();
    try {
      const result = readCursor(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for corrupt/invalid JSON", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, CURSOR_FILE), "not-json{{{{");
      const result = readCursor(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("returns null for empty file", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, CURSOR_FILE), "");
      const result = readCursor(tmp);
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("parses valid cursor JSON and returns the object", () => {
    const tmp = createTempDir();
    try {
      const cursor = {
        session_id: "abc-123",
        last_offset: 45230,
        cumulative: {
          input_tokens: 15000,
          output_tokens: 4200,
          cache_read_tokens: 8000,
          cache_creation_tokens: 500,
        },
        format_warning_emitted: false,
      };
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeFileSync(join(tmp, CURSOR_FILE), JSON.stringify(cursor));
      const result = readCursor(tmp);
      assert.deepEqual(result, cursor);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("never throws on read errors — always returns null", () => {
    // Pass a path that is a file (not a directory) to cause a read error
    const tmp = createTempDir();
    try {
      // Use a non-existent directory path that cannot be read
      const result = readCursor(join(tmp, "nonexistent-subdir"));
      assert.equal(result, null);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── writeCursor ─────────────────────────────────────────────────────────────

describe("writeCursor", () => {
  it("writes cursor JSON to the correct file path", () => {
    const tmp = createTempDir();
    try {
      const data = {
        session_id: "sess-001",
        last_offset: 1000,
        cumulative: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 0,
          cache_creation_tokens: 0,
        },
        format_warning_emitted: false,
      };
      writeCursor(tmp, data);
      assert.ok(existsSync(join(tmp, CURSOR_FILE)));
      const raw = readFileSync(join(tmp, CURSOR_FILE), "utf-8");
      const parsed = JSON.parse(raw);
      assert.deepEqual(parsed, data);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("creates .context-index/ directory if it does not exist", () => {
    const tmp = createTempDir();
    try {
      writeCursor(tmp, { session_id: "s", last_offset: 0, cumulative: {}, format_warning_emitted: false });
      assert.ok(existsSync(join(tmp, ".context-index")));
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("leaves no .tmp files after successful write (atomic write)", () => {
    const tmp = createTempDir();
    try {
      mkdirSync(join(tmp, ".context-index"), { recursive: true });
      writeCursor(tmp, { session_id: "s", last_offset: 0, cumulative: {}, format_warning_emitted: false });
      const files = readdirSync(join(tmp, ".context-index"));
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
      assert.equal(tmpFiles.length, 0);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("overwrites existing cursor file", () => {
    const tmp = createTempDir();
    try {
      const first = { session_id: "first", last_offset: 100, cumulative: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_creation_tokens: 0 }, format_warning_emitted: false };
      const second = { session_id: "second", last_offset: 200, cumulative: { input_tokens: 20, output_tokens: 10, cache_read_tokens: 5, cache_creation_tokens: 2 }, format_warning_emitted: true };
      writeCursor(tmp, first);
      writeCursor(tmp, second);
      const result = readCursor(tmp);
      assert.deepEqual(result, second);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── resetCursor ─────────────────────────────────────────────────────────────

describe("resetCursor", () => {
  it("writes a fresh cursor with zeroed cumulative and correct session_id and offset", () => {
    const tmp = createTempDir();
    try {
      resetCursor(tmp, "new-session-42", 99000);
      const result = readCursor(tmp);
      assert.equal(result.session_id, "new-session-42");
      assert.equal(result.last_offset, 99000);
      assert.deepEqual(result.cumulative, {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      });
      assert.equal(result.format_warning_emitted, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("resets cumulative to zero even if a prior cursor existed with non-zero values", () => {
    const tmp = createTempDir();
    try {
      const prior = {
        session_id: "old-session",
        last_offset: 5000,
        cumulative: { input_tokens: 9999, output_tokens: 888, cache_read_tokens: 777, cache_creation_tokens: 111 },
        format_warning_emitted: true,
      };
      writeCursor(tmp, prior);
      resetCursor(tmp, "fresh-session", 0);
      const result = readCursor(tmp);
      assert.equal(result.session_id, "fresh-session");
      assert.equal(result.last_offset, 0);
      assert.deepEqual(result.cumulative, {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_creation_tokens: 0,
      });
      assert.equal(result.format_warning_emitted, false);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("creates .context-index/ directory if it does not exist", () => {
    const tmp = createTempDir();
    try {
      resetCursor(tmp, "session-x", 0);
      assert.ok(existsSync(join(tmp, ".context-index")));
      assert.ok(existsSync(join(tmp, CURSOR_FILE)));
    } finally {
      cleanupTempDir(tmp);
    }
  });
});

// ── Round-trip ──────────────────────────────────────────────────────────────

describe("round-trip", () => {
  it("writeCursor then readCursor returns identical data", () => {
    const tmp = createTempDir();
    try {
      const data = {
        session_id: "round-trip-session",
        last_offset: 123456,
        cumulative: {
          input_tokens: 5000,
          output_tokens: 1200,
          cache_read_tokens: 3000,
          cache_creation_tokens: 800,
        },
        format_warning_emitted: true,
      };
      writeCursor(tmp, data);
      const result = readCursor(tmp);
      assert.deepEqual(result, data);
    } finally {
      cleanupTempDir(tmp);
    }
  });

  it("resetCursor then readCursor produces correct shape", () => {
    const tmp = createTempDir();
    try {
      resetCursor(tmp, "abc-xyz", 77777);
      const result = readCursor(tmp);
      assert.ok(typeof result === "object" && result !== null);
      assert.equal(result.session_id, "abc-xyz");
      assert.equal(result.last_offset, 77777);
      assert.ok("cumulative" in result);
      assert.ok("format_warning_emitted" in result);
    } finally {
      cleanupTempDir(tmp);
    }
  });
});
