import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// SKILL.md plus its references/ companions: progressive disclosure moved
// several of these instructions one file out of the body without changing
// the contract, and these are content-presence checks on the instruction.
import { readSkillSurface } from "../helpers.mjs";

describe("plan SKILL.md heuristic injection", () => {
  it("Step 2 includes heuristic loading instruction", () => {
    const content = readSkillSurface("plan");
    // After the inline-Node extraction sweep (PR 8-9), Step 2 invokes the
    // canonical CLI verb instead of importing retrieveHeuristics inline.
    assert.ok(
      content.includes("adev heuristics retrieve"),
      "Must invoke 'adev heuristics retrieve'",
    );
  });

  it("Context Packet Section includes Heuristics entry template", () => {
    const content = readSkillSurface("plan");
    assert.ok(content.includes("- Heuristics:"), "Must include Heuristics entry in context packets");
  });

  it("plan output includes ## Heuristics section template", () => {
    const content = readSkillSurface("plan");
    assert.ok(content.includes("## Heuristics"), "Must include Heuristics section");
    assert.ok(content.includes("review convenience"), "Must note snapshot is for review convenience");
  });

  it("documents non-blocking semantics", () => {
    const content = readSkillSurface("plan");
    assert.ok(
      content.includes("proceed without heuristics") || content.includes("non-blocking"),
      "Must document non-blocking behavior"
    );
  });
});
