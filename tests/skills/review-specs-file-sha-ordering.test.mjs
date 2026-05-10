// tests/skills/review-specs-file-sha-ordering.test.mjs
// Regression test for issue-187: file-sha must be captured AFTER Step 7
// writes the status update back to the spec, not before.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "review-specs", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("review-specs SKILL.md — file-sha ordering (issue-187)", () => {
  it("Step 6 does NOT capture file-sha before Step 7", () => {
    // Step 6 must not instruct running git hash-object directly —
    // that would capture the pre-status-update hash.
    const step6Match = skill.match(/## Step 6: Save Review Report([\s\S]*?)## Step 7:/);
    assert.ok(step6Match, "Step 6 section must exist");
    assert.doesNotMatch(
      step6Match[1],
      /git hash-object/,
      "Step 6 must not run git hash-object — SHA must be captured after Step 7 writes the spec"
    );
  });

  it("file-sha is stamped in a step after Step 7", () => {
    // There must be a step (Step 6b or similar) that runs after Step 7
    // and captures the final SHA.
    assert.match(
      skill,
      /Step 6b|after Step 7[\s\S]{0,200}file-sha|file-sha[\s\S]{0,200}after Step 7/i,
      "A step after Step 7 must stamp the final file-sha"
    );
  });

  it("explains why file-sha must be captured after the status update", () => {
    assert.match(
      skill,
      /review-pending.*review-passed|status.*update.*hash|hash.*status.*update|false drift|diverge/i,
      "Must explain that status update changes the file hash, motivating post-Step-7 SHA capture"
    );
  });

  it("Step 7 update spec status section still exists", () => {
    assert.match(skill, /## Step 7: Update Spec Status/, "Step 7 must still exist");
  });
});
