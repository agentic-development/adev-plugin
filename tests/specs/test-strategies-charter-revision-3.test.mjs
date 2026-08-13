// tests/specs/test-strategies-charter-revision-3.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charter = readFileSync(
  new URL(
    "../../.context-index/specs/features/test-strategies/charter.md",
    import.meta.url,
  ),
  "utf8",
);

test("charter revision 3 adds the Test Depth Policy capability row", () => {
  assert.match(charter, /Test Depth Policy/);
});

test("charter Domain Model declares TestDepthAssignment entity", () => {
  assert.match(charter, /TestDepthAssignment/);
});

test("charter Consumed APIs lists Spec test_depth field alongside test_strategy field", () => {
  assert.match(charter, /test_depth field/);
  assert.match(charter, /test_strategy field/); // pre-existing row must remain
});

test("charter Out of Scope qualifies floor enforcement as excluded", () => {
  assert.match(charter, /enforc/i);
});
