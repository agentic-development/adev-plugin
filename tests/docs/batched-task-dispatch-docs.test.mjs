// tests/docs/batched-task-dispatch-docs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/cli-reference.md documents adev implement batches", () => {
  const doc = read("docs/cli-reference.md");
  assert.match(doc, /adev implement batches/);
});

test("docs/skill-reference.md documents --no-batch and --max-batch", () => {
  const doc = read("docs/skill-reference.md");
  assert.match(doc, /--no-batch/);
  assert.match(doc, /--max-batch/);
});

test("docs/cli-reference.md documents the batches exit codes and error codes", () => {
  const doc = read("docs/cli-reference.md");
  assert.match(doc, /CONFLICTING_BATCH_FLAGS/);
  assert.match(doc, /INVALID_MAX_BATCH_SIZE/);
  assert.match(doc, /ROUTING_SIDECAR_MISSING/);
});

test("docs/skill-reference.md cross-references the --parallel relationship", () => {
  const doc = read("docs/skill-reference.md");
  assert.match(doc, /--parallel/);
});
