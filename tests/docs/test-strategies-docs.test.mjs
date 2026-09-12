import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/test-strategies.md documents the entry-point boundary rule for unit tasks", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /entry[- ]point/i);
});

test("docs/test-strategies.md documents the mocking-boundary and entry-point rules together", () => {
  const doc = read("docs/test-strategies.md");
  const unitSection = doc.slice(doc.indexOf("For a `unit` task"));
  assert.match(unitSection.slice(0, 1200), /mock/i);
  assert.match(unitSection.slice(0, 1200), /entry[- ]point/i);
});

test("docs/test-strategies.md scopes the entry-point rule to supplement-not-replacement", () => {
  const doc = read("docs/test-strategies.md");
  assert.match(doc, /supplement/i);
});
