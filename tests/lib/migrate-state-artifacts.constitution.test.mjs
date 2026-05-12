/**
 * Constitution scoped-match tests.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { migrateConstitution } from "../../lib/migrate-state-artifacts.mjs";

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  return dir;
}

const TARGET_ROW = "| Build state | `.context-index/build-state/` |";
const REPLACEMENT = "| Lifecycle state | `.context-index/lifecycle-state/` |";

describe("migrateConstitution — scoped match", () => {
  it("replaces row when present only in active Context Routing table", async () => {
    const root = makeProject();
    try {
      const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n${TARGET_ROW}\n\n## Other section\n\nNothing here.\n`;
      writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
      const result = await migrateConstitution(root, {});
      assert.equal(result.action, "migrated");
      const updated = readFileSync(
        join(root, ".context-index", "constitution.md"),
        "utf8",
      );
      assert.ok(updated.includes(REPLACEMENT));
    } finally {
      cleanupTempDir(root);
    }
  });

  it("CONSTITUTION_AMBIGUOUS_MATCH when target appears twice", async () => {
    const root = makeProject();
    try {
      // Two literal-identical rows: one in active table, one in a quoted ADR section.
      const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n${TARGET_ROW}\n\n## Historical example\n\nIn ADR-N we had:\n\n${TARGET_ROW}\n`;
      writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
      await assert.rejects(
        () => migrateConstitution(root, {}),
        (e) => {
          assert.equal(e.code, "CONSTITUTION_AMBIGUOUS_MATCH");
          assert.ok(Array.isArray(e.occurrenceLines));
          assert.equal(e.occurrenceLines.length, 2);
          return true;
        },
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("skips when target row is inside a fenced code block only", async () => {
    const root = makeProject();
    try {
      const constitution = `# Constitution\n\n## Context Routing\n\n| K | V |\n|---|---|\n| Some | other |\n\n## Example\n\n\`\`\`markdown\n${TARGET_ROW}\n\`\`\`\n`;
      writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
      const result = await migrateConstitution(root, {});
      assert.equal(result.action, "skipped");
      const updated = readFileSync(
        join(root, ".context-index", "constitution.md"),
        "utf8",
      );
      // Target row remains
      assert.ok(updated.includes(TARGET_ROW));
    } finally {
      cleanupTempDir(root);
    }
  });

  it("skips with CONSTITUTION_ROW_MISSING advisory when row absent and not migrated", async () => {
    const root = makeProject();
    try {
      const constitution = `# Constitution\n\n## Context Routing\n\n| Some | other |\n`;
      writeFileSync(join(root, ".context-index", "constitution.md"), constitution);
      const result = await migrateConstitution(root, {});
      assert.equal(result.action, "skipped");
      const adv = result.advisories.find((a) => a.code === "CONSTITUTION_ROW_MISSING");
      assert.ok(adv);
    } finally {
      cleanupTempDir(root);
    }
  });
});
