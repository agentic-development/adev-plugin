import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

test("Legacy tasks.json (no seq field) upgrades transparently on first write", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    // Pre-CAS document — no seq field
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, epics: [], issues: [] }),
    );

    const adapter = new JsonAdapter(root);
    await adapter.create({ title: "First post-upgrade issue", type: "task" });

    const after = JSON.parse(readFileSync(join(root, ".context-index/tasks/tasks.json"), "utf8"));
    assert.equal(after.seq, 1, "first CAS write should stamp seq=1");
    assert.equal(after.issues.length, 1);
    assert.equal(after.issues[0].title, "First post-upgrade issue");
  } finally {
    cleanupTempDir(root);
  }
});

test("Legacy tasks.json read-only operations work without seq field", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({
        version: 2,
        epics: [{ id: "epic-1", title: "E", status: "open" }],
        issues: [{ id: "issue-1", title: "I", status: "open", type: "task", priority: 2 }],
      }),
    );
    const adapter = new JsonAdapter(root);
    const issues = await adapter.list();
    const epics = await adapter.listEpics();
    assert.equal(issues.length, 1);
    assert.equal(epics.length, 1);
  } finally {
    cleanupTempDir(root);
  }
});
