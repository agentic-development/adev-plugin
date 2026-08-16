// tests/specs/explicit-governance-registries-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SPEC = new URL(
  "../../.context-index/specs/cross-cutting/explicit-governance-registries.spec.md",
  import.meta.url,
);

test("SA-1: Changes Catalog names both writers of the per-gate outcome array", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.match(spec, /lib\/cli\/report\.mjs/);
  assert.match(spec, /reportValidator/);
});

test("SA-2: the materialized_at registry set is bounded, not universal", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /each governance yaml|every registry/i);

  // Scope the positive assertions to the statement that introduces the bounded
  // set, not to the whole file: the three filenames also appear in the Current
  // State table for an unrelated reason, so a whole-file match is not
  // discriminating. Matching per filename also keeps the test order-free.
  const markedSet = spec.match(/^.*Marked registries, exhaustively \(SA-2\):.*$/m);
  assert.ok(markedSet, "spec must enumerate the marked registries exhaustively");
  for (const registry of ["review\\.yaml", "diagnostics\\.yaml", "gates\\.yaml"]) {
    assert.match(markedSet[0], new RegExp("`" + registry + "`"));
  }
  assert.match(
    markedSet[0],
    /`validate\.yaml` and `boundaries\.yaml` are \*\*exempt\*\*/,
  );
});

test("CON-1: staleness compares timestamps, never a SHA ordering", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /at or after the source-manifest SHA/i);
  assert.match(spec, /computed-at/);
});
