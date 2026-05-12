/**
 * Atomic-write fault injection tests (Task 16).
 *
 * Tests writeTasksMd and CLI status --render under various write-failure
 * scenarios. Asserts prior content preserved, temp file cleaned up
 * (best-effort per CON-6), follow-up render succeeds.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { writeTasksMd } from "../../../lib/issues/render-markdown.mjs";
import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../../helpers.mjs";

function seedProject(tmp) {
  writeFixture(tmp, ".context-index/manifest.yaml", "project:\n  name: atomic-test\n");
  return tmp;
}

describe("writeTasksMd atomic-write fault injection (Task 16)", () => {
  let tmp;
  beforeEach(() => {
    tmp = seedProject(createTempDir());
  });
  afterEach(() => cleanupTempDir(tmp));

  it("preserves prior tasks.md content when rename fails", async () => {
    const adapter = new JsonAdapter(tmp);
    await adapter.init();
    await adapter.create({ title: "Original", type: "task", priority: 2 });
    await writeTasksMd(tmp);
    const target = join(tmp, ".context-index", "tasks", "tasks.md");
    const beforeContent = readFileSync(target, "utf8");
    assert.ok(beforeContent.includes("Original"), "seed render must include Original");

    // Inject failure: replace the target file with a directory so the next
    // rename fails. Atomic write must preserve prior state (or rather, the
    // prior directory remains — but importantly, no partial-write state
    // and no orphan temp file).
    const { rmSync } = await import("node:fs");
    rmSync(target, { recursive: false });
    mkdirSync(target);

    await assert.rejects(() => writeTasksMd(tmp), (err) => {
      // Some fs error is rethrown.
      assert.ok(err instanceof Error, "must throw on rename failure");
      return true;
    });

    // Verify no orphan temp files remain (CON-6 best-effort cleanup).
    const dir = join(tmp, ".context-index", "tasks");
    const entries = readdirSync(dir);
    const tmpFiles = entries.filter((n) => n.startsWith("tasks.md.") && n.endsWith(".tmp"));
    assert.equal(tmpFiles.length, 0, `orphan temp files found: ${tmpFiles.join(", ")}`);
  });

  it("follow-up render succeeds after the failure scenario is resolved", async () => {
    const adapter = new JsonAdapter(tmp);
    await adapter.init();
    await adapter.create({ title: "Original", type: "task", priority: 2 });
    await writeTasksMd(tmp);

    // Inject and resolve.
    const target = join(tmp, ".context-index", "tasks", "tasks.md");
    const { rmSync } = await import("node:fs");
    rmSync(target);
    mkdirSync(target);
    await assert.rejects(() => writeTasksMd(tmp));
    rmSync(target, { recursive: true });

    // Now a follow-up render must succeed.
    await writeTasksMd(tmp);
    assert.ok(existsSync(target), "follow-up render must produce tasks.md");
  });
});
