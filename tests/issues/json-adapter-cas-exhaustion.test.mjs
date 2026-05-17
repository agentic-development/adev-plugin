import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonAdapter, MAX_CAS_RETRIES } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("STALE_BOARD_WRITE thrown after MAX_CAS_RETRIES exhausted", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    await new JsonAdapter(root).init();

    const adapter = new JsonAdapter(root);

    // Force every CAS attempt to lose: after each _readWithSeq, bump disk
    // seq behind the adapter's back. Every retry sees a fresh snapshot but
    // by the time it tries to commit, disk has already advanced again.
    const orig = adapter._readWithSeq.bind(adapter);
    adapter._readWithSeq = function () {
      const result = orig();
      const board = JSON.parse(
        readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
      );
      writeFileSync(
        join(root, ".context-index/tasks/tasks.json"),
        JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
      );
      return result;
    };

    await assert.rejects(
      () => adapter.create({ title: "Doomed", type: "task" }),
      (err) => {
        assert.equal(err.code, "STALE_BOARD_WRITE", `expected STALE_BOARD_WRITE, got ${err.code}`);
        // Message must include op name + retry count (integers only)
        assert.match(err.message, /create/, "message should include op name");
        assert.match(
          err.message,
          new RegExp(`${MAX_CAS_RETRIES} retries`),
          "message should include retry count",
        );
        // Message MUST NOT include filesystem paths or document contents
        assert.ok(!err.message.includes("/tasks.json"), "message must not leak filesystem paths");
        assert.ok(!err.message.includes("Doomed"), "message must not leak document contents");
        return true;
      },
    );
  } finally {
    cleanupTempDir(root);
  }
});

test("STALE_BOARD_WRITE message references the failing op name correctly", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    await new JsonAdapter(root).init();
    const adapter = new JsonAdapter(root);
    const created = await adapter.create({ title: "Target", type: "task" });

    // Same exhaustion pattern, but on update()
    const orig = adapter._readWithSeq.bind(adapter);
    adapter._readWithSeq = function () {
      const result = orig();
      const board = JSON.parse(
        readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
      );
      writeFileSync(
        join(root, ".context-index/tasks/tasks.json"),
        JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
      );
      return result;
    };

    await assert.rejects(
      () => adapter.update(created.id, { status: "in_progress" }),
      (err) => {
        assert.equal(err.code, "STALE_BOARD_WRITE");
        assert.match(err.message, /update/, "message should name the update op");
        return true;
      },
    );
  } finally {
    cleanupTempDir(root);
  }
});
