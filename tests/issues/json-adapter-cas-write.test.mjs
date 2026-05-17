import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("_write(data, expectedSeq) throws STALE_BOARD_WRITE_RETRY when disk seq advanced", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const { board, seq } = adapter._readWithSeq();
    assert.equal(seq, 0);

    // Simulate concurrent writer bumping disk to seq 1 between our read and write
    writeFileSync(
      join(root, ".context-index/tasks/tasks.json"),
      JSON.stringify({ version: 2, seq: 1, epics: [], issues: [] }) + "\n",
    );

    assert.throws(
      () => adapter._write(board, 0),
      (err) => err.code === "STALE_BOARD_WRITE_RETRY",
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("_write(data, expectedSeq) stamps seq = expectedSeq + 1 on success", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 0, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    adapter._write({ version: 2, epics: [], issues: [] }, 0);
    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 1);
  } finally {
    cleanupTempDir(root);
  }
});

test("_write preserves seq through the reconstructor (cross-spec amendment)", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 5, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    // Multiple successful writes: each must bump seq monotonically
    adapter._write({ version: 2, epics: [], issues: [] }, 5);
    let after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 6);

    adapter._write({ version: 2, epics: [], issues: [] }, 6);
    after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 7);
  } finally {
    cleanupTempDir(root);
  }
});

test("_write(data, null) bypasses CAS — used for init path", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    const adapter = new JsonAdapter(root);
    // No tasks.json yet; init-style write must succeed without expectedSeq check
    adapter._write({ version: 2, epics: [], issues: [] }, null);
    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 0);
  } finally {
    cleanupTempDir(root);
  }
});
