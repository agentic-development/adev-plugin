/**
 * Performance baseline for `JsonAdapter` on a 1000-issue board.
 *
 * Goal: prove that `list()`, `create()`, and `update()` complete within
 * one order of magnitude of the historical `FileAdapter` baseline. Concrete
 * thresholds are intentionally generous; this is a regression guard, not a
 * benchmark.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "json-adapter-perf-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

/** Bootstrap a board with N issues. */
async function seed(adapter, n) {
  await adapter.init();
  // Seed by writing the board directly to avoid N writes (each is O(N)
  // because the adapter rewrites the whole file). Direct write keeps setup
  // bounded.
  const now = new Date().toISOString();
  const issues = [];
  for (let i = 1; i <= n; i++) {
    issues.push({
      id: `issue-${i}`,
      title: `Issue ${i}`,
      status: "open",
      priority: 2,
      type: "task",
      dependencies: [],
      notes: "",
      created: now,
      updated: now,
    });
  }
  adapter._write({ version: 2, epics: [], issues });
}

describe("JsonAdapter — 1000-issue performance baseline", () => {
  it("list() completes in under 1500ms on a 1000-issue board", async () => {
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      await seed(adapter, 1000);

      const start = performance.now();
      const result = await adapter.list({});
      const elapsed = performance.now() - start;

      assert.equal(result.length, 1000);
      assert.ok(elapsed < 1500, `list() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("create() on a 1000-issue board completes in under 1500ms", async () => {
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      await seed(adapter, 1000);

      const start = performance.now();
      await adapter.create({ title: "New one", type: "task" });
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 1500, `create() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("update() on a 1000-issue board completes in under 1500ms", async () => {
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      await seed(adapter, 1000);

      const start = performance.now();
      await adapter.update("issue-500", { priority: 0 });
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 1500, `update() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("get() on a 1000-issue board completes in under 1500ms", async () => {
    const dir = makeProject();
    try {
      const adapter = new JsonAdapter(dir);
      await seed(adapter, 1000);

      const start = performance.now();
      await adapter.get("issue-750");
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 1500, `get() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
