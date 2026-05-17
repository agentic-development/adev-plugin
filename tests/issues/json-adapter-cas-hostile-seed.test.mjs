import { test } from "node:test";
import assert from "node:assert/strict";
import { JsonAdapter } from "../../lib/issues/json-adapter.mjs";
import { createTempDir, cleanupTempDir, writeFixture } from "../helpers.mjs";

const invalidSeqs = [
  { name: "negative integer", value: -1 },
  { name: "non-integer", value: 1.5 },
  { name: "string", value: "42" },
  { name: "NaN", value: Number.NaN },
  { name: "above MAX_SAFE_INTEGER", value: Number.MAX_SAFE_INTEGER + 1 },
];

for (const { name, value } of invalidSeqs) {
  test(`INVALID_BOARD_SEQ rejects ${name} (${String(value)})`, async () => {
    const root = createTempDir();
    try {
      writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
      writeFixture(
        root,
        ".context-index/tasks/tasks.json",
        JSON.stringify({ version: 2, seq: value, epics: [], issues: [] }),
      );
      const adapter = new JsonAdapter(root);
      await assert.rejects(
        () => adapter.list(),
        (err) => {
          assert.equal(err.code, "INVALID_BOARD_SEQ");
          // Error message MUST NOT echo the offending value (SEC-1 sanitization)
          assert.ok(
            !String(err.message).includes(String(value)),
            `error message leaked the offending value: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      cleanupTempDir(root);
    }
  });
}

test("valid seq (integer 0..MAX_SAFE_INTEGER) is accepted", async () => {
  const root = createTempDir();
  try {
    writeFixture(root, ".context-index/manifest.yaml", "tasks:\n  backend: json\n");
    writeFixture(
      root,
      ".context-index/tasks/tasks.json",
      JSON.stringify({ version: 2, seq: 42, epics: [], issues: [] }),
    );
    const adapter = new JsonAdapter(root);
    const issues = await adapter.list();
    assert.deepEqual(issues, []);
  } finally {
    cleanupTempDir(root);
  }
});
