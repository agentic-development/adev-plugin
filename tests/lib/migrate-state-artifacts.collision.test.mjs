/**
 * Collision tests — RENAME_COLLISION + LIFECYCLE_STATE_FILE_EXISTS +
 * skip-rename recovery flow.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { migrateLifecycleState } from "../../lib/migrate-state-artifacts.mjs";

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  return dir;
}

describe("per-file collision", () => {
  it("matching slug.jsonl already present → idempotent skip (CON-4)", async () => {
    // Per spec CON-4: when both legacy <slug>.json and migrated <slug>.jsonl
    // exist for the same slug, treat the migrated target as authoritative
    // and skip silently. (LIFECYCLE_STATE_FILE_EXISTS is the OTHER path:
    // a stray <slug>.jsonl exists for a slug that ISN'T present in the
    // source dir as well — handled by the orphan check.)
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      const lsDir = join(root, ".context-index", "lifecycle-state");
      mkdirSync(bsDir, { recursive: true });
      writeFileSync(
        join(bsDir, "foo.json"),
        JSON.stringify({
          spec: ".context-index/specs/x/foo.spec.md",
          status: "in_progress",
          steps: [{ name: "review", status: "completed", verdict: "PASS" }],
        }),
      );
      mkdirSync(lsDir, { recursive: true });
      const existingContent = '{"event":"existing","ts":"2026-01-01T00:00:00Z"}\n';
      writeFileSync(join(lsDir, "foo.jsonl"), existingContent);

      const result = await migrateLifecycleState(root, {});
      assert.equal(result.action, "skipped");
      // Verify existing file is unchanged
      const after = readFileSync(join(lsDir, "foo.jsonl"), "utf8");
      assert.equal(after, existingContent);
    } finally {
      cleanupTempDir(root);
    }
  });

  it("BUILD_STATE_ORPHAN surfaces orphan slug", async () => {
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      const lsDir = join(root, ".context-index", "lifecycle-state");
      mkdirSync(bsDir, { recursive: true });
      mkdirSync(lsDir, { recursive: true });
      // build-state has foo, lifecycle-state has bar — orphan
      writeFileSync(
        join(bsDir, "foo.json"),
        JSON.stringify({ status: "in_progress", steps: [] }),
      );
      writeFileSync(join(lsDir, "bar.jsonl"), '{"event":"x","ts":"2026-01-01T00:00:00Z"}\n');

      await assert.rejects(
        () => migrateLifecycleState(root, {}),
        (e) => {
          assert.equal(e.code, "BUILD_STATE_ORPHAN");
          assert.equal(e.slug, "foo");
          return true;
        },
      );
    } finally {
      cleanupTempDir(root);
    }
  });
});

describe("skip-rename recovery flow", () => {
  it("migrateLifecycleState with skipRename writes jsonl without touching source dir", async () => {
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      mkdirSync(bsDir, { recursive: true });
      writeFileSync(
        join(bsDir, "foo.json"),
        JSON.stringify({
          status: "in_progress",
          steps: [{ name: "review", status: "completed", verdict: "PASS" }],
        }),
      );
      const result = await migrateLifecycleState(root, { skipRename: true });
      assert.equal(result.action, "migrated");
      assert.ok(existsSync(join(root, ".context-index", "lifecycle-state", "foo.jsonl")));
      // Source still exists
      assert.ok(existsSync(join(bsDir, "foo.json")));
    } finally {
      cleanupTempDir(root);
    }
  });
});
