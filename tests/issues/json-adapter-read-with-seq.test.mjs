import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("_readWithSeq returns { board, seq } from disk", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 42, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const result = adapter._readWithSeq();
    assert.equal(result.seq, 42);
    assert.deepEqual(result.board.epics, []);
    assert.deepEqual(result.board.issues, []);
  } finally {
    cleanupTempDir(root);
  }
});

test("_readWithSeq treats missing seq as 0 (legacy doc)", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const result = adapter._readWithSeq();
    assert.equal(result.seq, 0);
  } finally {
    cleanupTempDir(root);
  }
});

test("_readWithSeq returns seq:0 when tasks.json is absent", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    const adapter = new JsonAdapter(root);
    const result = adapter._readWithSeq();
    assert.equal(result.seq, 0);
    assert.deepEqual(result.board.epics, []);
    assert.deepEqual(result.board.issues, []);
  } finally {
    cleanupTempDir(root);
  }
});

test("_read continues returning board only (read-only path unchanged)", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 5, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const board = adapter._read();
    // _read returns a board-shaped object directly (epics + issues), not {board, seq}
    assert.ok(Array.isArray(board.epics));
    assert.ok(Array.isArray(board.issues));
    assert.equal(board.version, 2);
  } finally {
    cleanupTempDir(root);
  }
});
