import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skills = {
  debug: readSkillSurface("debug"),
  brainstorm: readSkillSurface("brainstorm"),
  specify: readSkillSurface("specify"),
  "review-specs": readSkillSurface("review-specs"),
  validate: readSkillSurface("validate"),
};

for (const [name, content] of Object.entries(skills)) {
  describe(`${name} SKILL.md heuristic injection`, () => {
    it("invokes `adev heuristics retrieve`", () => {
      // After the inline-Node extraction sweep (PR 8-9), skills call the
      // canonical CLI verb instead of importing `retrieveHeuristics` inline.
      assert.ok(content.includes("adev heuristics retrieve"),
        `${name} should invoke 'adev heuristics retrieve'`);
    });
    it("uses summary tier", () => {
      assert.ok(content.includes("summary") || content.includes("tier"),
        `${name} should specify summary tier`);
    });
    it("includes the canonical preamble", () => {
      assert.ok(content.includes("lessons learned") || content.includes("guidance, not as hard rules"),
        `${name} should include the heuristic preamble`);
    });
    it("specifies non-blocking behavior", () => {
      assert.ok(
        content.includes("proceed without") ||
          content.includes("non-blocking") ||
          content.includes("stays non-blocking") ||
          content.includes("__NONE__"),
        `${name} should be non-blocking on failure`,
      );
    });
  });
}

describe("debug SKILL.md keyword derivation", () => {
  it("specifies keyword extraction from error message", () => {
    assert.ok(skills.debug.includes("keyword") || skills.debug.includes("keywords"));
  });
  it("specifies stop word filtering", () => {
    assert.ok(skills.debug.includes("stop") || skills.debug.includes("filter"));
  });
});
