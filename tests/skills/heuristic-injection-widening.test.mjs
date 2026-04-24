import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skills = {
  debug: readFileSync(new URL("../../skills/debug/SKILL.md", import.meta.url), "utf8"),
  brainstorm: readFileSync(new URL("../../skills/brainstorm/SKILL.md", import.meta.url), "utf8"),
  specify: readFileSync(new URL("../../skills/specify/SKILL.md", import.meta.url), "utf8"),
  "review-specs": readFileSync(new URL("../../skills/review-specs/SKILL.md", import.meta.url), "utf8"),
  validate: readFileSync(new URL("../../skills/validate/SKILL.md", import.meta.url), "utf8"),
};

for (const [name, content] of Object.entries(skills)) {
  describe(`${name} SKILL.md heuristic injection`, () => {
    it("references retrieveHeuristics", () => {
      assert.ok(content.includes("retrieveHeuristics"),
        `${name} should reference retrieveHeuristics`);
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
      assert.ok(content.includes("proceed without") || content.includes("non-blocking"),
        `${name} should be non-blocking on failure`);
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
