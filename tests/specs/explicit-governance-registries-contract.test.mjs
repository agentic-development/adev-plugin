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
  assert.match(spec, /review\.yaml.*diagnostics\.yaml.*gates\.yaml/s);
});

test("CON-1: staleness compares timestamps, never a SHA ordering", () => {
  const spec = readFileSync(SPEC, "utf8");
  assert.doesNotMatch(spec, /at or after the source-manifest SHA/i);
  assert.match(spec, /computed-at/);
});
