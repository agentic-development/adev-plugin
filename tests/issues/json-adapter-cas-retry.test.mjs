import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JsonAdapter, MAX_CAS_RETRIES } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("MAX_CAS_RETRIES is exported and defaults to 3", () => {
  assert.equal(MAX_CAS_RETRIES, 3);
});

test("adapter.casMaxRetries defaults to MAX_CAS_RETRIES when manifest knob absent", () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    const adapter = new JsonAdapter(root);
    assert.equal(adapter.casMaxRetries, MAX_CAS_RETRIES);
  } finally {
    cleanupTempDir(root);
  }
});

test("manifest tasks.cas_max_retries overrides MAX_CAS_RETRIES default", () => {
  const root = createTempDir();
  try {
    writeFixture(
      root,
      ".context-index/manifest.yaml",
      "tasks:\n  backend: json\n  cas_max_retries: 5\n",
    );
    const adapter = new JsonAdapter(root);
    assert.equal(adapter.casMaxRetries, 5);
  } finally {
    cleanupTempDir(root);
  }
});

test("create() retries on stale snapshot and lands on retry", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    await new JsonAdapter(root).init();

    const adapter = new JsonAdapter(root);

    // Inject a single-shot stale-write: monkey-patch _readWithSeq to bump
    // disk seq AFTER returning the captured snapshot on the FIRST call,
    // then return real disk state thereafter.
    let firstCall = true;
    const origRead = adapter._readWithSeq.bind(adapter);
    adapter._readWithSeq = function () {
      const result = origRead();
      if (firstCall) {
        firstCall = false;
        // Forge a concurrent write that bumps disk past our captured seq
        writeFileSync(
          join(root, ".context-index/tasks/tasks.json"),
          JSON.stringify({
            version: 2,
            seq: result.seq + 1,
            epics: [],
            issues: [],
          }) + "\n",
        );
      }
      return result;
    };

    const issue = await adapter.create({ title: "Test", type: "task" });
    assert.equal(issue.id, "issue-1");

    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.issues.length, 1);
    assert.equal(after.issues[0].title, "Test");
    // initial seq 0 → injected bump to 1 → retry stamps 2
    assert.equal(after.seq, 2);
  } finally {
    cleanupTempDir(root);
  }
});

test("update() retries on stale snapshot and lands on retry", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    const adapter = new JsonAdapter(root);
    await adapter.init();
    const created = await adapter.create({ title: "Original", type: "task" });

    // Wrap _readWithSeq to inject one stale-write cycle
    let injected = false;
    const orig = adapter._readWithSeq.bind(adapter);
    adapter._readWithSeq = function () {
      const result = orig();
      if (!injected) {
        injected = true;
        const board = JSON.parse(
          readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"),
        );
        writeFileSync(
          join(root, ".context-index/tasks/tasks.json"),
          JSON.stringify({ ...board, seq: board.seq + 1 }) + "\n",
        );
      }
      return result;
    };

    const updated = await adapter.update(created.id, { status: "in_progress" });
    assert.equal(updated.status, "in_progress");
  } finally {
    cleanupTempDir(root);
  }
});
