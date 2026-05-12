/**
 * Parse-error advisory redaction tests.
 *
 * Spec: .context-index/specs/features/agent-reliable-state-artifacts/one-shot-migration-tool.spec.md
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";
import { migrateAll, _internal } from "../../lib/migrate-state-artifacts.mjs";

const SECRET = "SUPER_SECRET_API_KEY_hunter2_DO_NOT_LEAK";

function makeProject() {
  const dir = createTempDir();
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    'project:\n  name: "t"\n',
  );
  return dir;
}

describe("parse-error advisory redaction", () => {
  it("malformed build-state JSON does not leak raw content", async () => {
    const root = makeProject();
    try {
      const bsDir = join(root, ".context-index", "build-state");
      mkdirSync(bsDir, { recursive: true });
      // malformed JSON with a secret in it
      writeFileSync(
        join(bsDir, "foo.json"),
        `{ "api_key": "${SECRET}", not_valid_json: [`,
      );
      const result = await migrateAll(root, {});
      assert.equal(result.failed, true);

      // The secret must NOT appear in any failure advisory's context
      // (we redact via safeContext)
      const fail = result.preflight.failures.find((f) =>
        f.code === "BUILD_STATE_PARSE_ERROR" || f.code === "PARSE_ERROR" ||
        (typeof f.context === "string" && f.context.length > 0)
      );
      // The preflight returns a structured advisory; ensure raw secret is
      // not embedded in any failure record's serialized form.
      const serialized = JSON.stringify(result.preflight.failures);
      assert.ok(
        !serialized.includes(SECRET),
        `secret should NOT be present in preflight failure serialization`,
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("malformed milestones.yaml does not leak raw content", async () => {
    const root = makeProject();
    try {
      const yamlPath = join(root, ".context-index", "milestones.yaml");
      // Broken YAML with secret
      writeFileSync(
        yamlPath,
        `password: ${SECRET}\nmilestones:\n  - name: ":bad:\n   nested:\n      [unbalanced\n`,
      );
      const result = await migrateAll(root, {});
      const serialized = JSON.stringify(result);
      assert.ok(
        !serialized.includes(SECRET),
        `secret should NOT be present in migrate result`,
      );
    } finally {
      cleanupTempDir(root);
    }
  });

  it("safeContext strips control chars and caps at 200", () => {
    const raw = "hello\x00world" + "x".repeat(500);
    const ctx = _internal.safeContext(raw);
    assert.ok(!ctx.includes("\x00"));
    assert.ok(ctx.length <= 200);
  });
});
