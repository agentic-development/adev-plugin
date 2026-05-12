/**
 * Idempotency tests for migrate-state-artifacts.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { migrateAll } from "../../lib/migrate-state-artifacts.mjs";

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  writeFileSync(
    join(dir, ".context-index", "milestones.yaml"),
    'milestones:\n  - name: "0.25.0"\n    status: planned\n',
  );
  writeFileSync(
    join(dir, ".context-index", "constitution.md"),
    "# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Build state | `.context-index/build-state/` |\n",
  );
  return dir;
}

describe("idempotency — three-run check", () => {
  it("first run migrates, second run skips with no I/O", async () => {
    const root = makeProject();
    try {
      const first = await migrateAll(root, {});
      assert.equal(first.failed, false);
      const milestones1 = first.results.find((r) => r.artifact === "milestones");
      assert.equal(milestones1?.action, "migrated");

      // Capture mtimes
      const targets = [
        join(root, ".context-index", "milestones.json"),
        join(root, ".context-index", "constitution.md"),
      ];
      const mtimes1 = targets.map((t) => statSync(t).mtimeMs);

      // Sleep a moment to allow detectable mtime delta
      await new Promise((r) => setTimeout(r, 50));

      const second = await migrateAll(root, {});
      assert.equal(second.failed, false);
      for (const r of second.results) {
        assert.equal(r.action, "skipped", `${r.artifact} should be skipped`);
      }
      const mtimes2 = targets.map((t) => statSync(t).mtimeMs);
      assert.deepEqual(mtimes1, mtimes2, "skip path produces no on-disk diff");
    } finally {
      cleanupTempDir(root);
    }
  });

  it("third run still skips when legacy files are removed", async () => {
    const root = makeProject();
    try {
      await migrateAll(root, {});
      // Remove the legacy files manually
      unlinkSync(join(root, ".context-index", "milestones.yaml"));
      const third = await migrateAll(root, {});
      assert.equal(third.failed, false);
      const milestones3 = third.results.find((r) => r.artifact === "milestones");
      assert.equal(milestones3?.action, "skipped");
    } finally {
      cleanupTempDir(root);
    }
  });
});
