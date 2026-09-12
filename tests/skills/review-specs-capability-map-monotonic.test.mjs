// tests/skills/review-specs-capability-map-monotonic.test.mjs
// Regression test: Step 7's Capability Map update must not regress a row
// that has already advanced past `review-passed` (e.g. `implemented`) when
// a spec is revised and re-reviewed after validate FAILs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

function capabilityMapSection() {
  const match = skill.match(
    /\*\*Charter Capability Map update \(PASS or PASS_WITH_NOTES only\)[^*]*:\*\*([\s\S]*?)(?:\n## |\n\*\*Note:\*\*)/,
  );
  assert.ok(match, "Charter Capability Map update block must exist under Step 7");
  return match[1];
}

describe("review-specs SKILL.md — Step 7 Capability Map monotonic write", () => {
  it("does not unconditionally overwrite the row's Status on every passing verdict", () => {
    const section = capabilityMapSection();
    assert.match(
      section,
      /only|monotonic|already|later|beyond|advanced|skip/i,
      "the update must be conditioned on the row's current status, not applied unconditionally",
    );
  });

  it("names a later lifecycle status (e.g. implemented) that must not be regressed", () => {
    const section = capabilityMapSection();
    assert.match(
      section,
      /implemented|validated|planned/i,
      "must name at least one later lifecycle status the guard protects",
    );
  });

  it("instructs logging or recording when the write is skipped", () => {
    const section = capabilityMapSection();
    assert.match(
      section,
      /log|record|note/i,
      "a skipped write must be logged, not silently dropped",
    );
  });
});
