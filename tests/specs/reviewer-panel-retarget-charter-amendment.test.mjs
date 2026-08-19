// tests/specs/reviewer-panel-retarget-charter-amendment.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const charter = readFileSync(
  new URL("../../.context-index/specs/features/reviewer-domain-fit/charter.md", import.meta.url),
  "utf8",
);

test("Phase 2's first acceptance criterion no longer claims blocker_id comes from the --origin review-specs command", () => {
  assert.doesNotMatch(
    charter,
    /blocker_id comes from `adev heuristics signature --origin review-specs --blocker-id`/,
  );
});

test("Phase 2's first acceptance criterion matches the spec's Deviation note (omit blocker_id, emit section_anchor + finding-type)", () => {
  const phase2Section = charter.slice(charter.indexOf("### Phase 2"), charter.indexOf("### Phase 3"));
  assert.match(phase2Section, /section_anchor/);
  assert.match(phase2Section, /finding-type|finding_type/);
});
