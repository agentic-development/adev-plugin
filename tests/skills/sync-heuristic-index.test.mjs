import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// SKILL.md plus its references/ companions: progressive disclosure moved
// several of these instructions one file out of the body without changing
// the contract, and these are content-presence checks on the instruction.
import { readSkillSurface } from "../helpers.mjs";

describe("sync SKILL.md heuristic index injection", () => {
  it("references retrieveHeuristics from lib/heuristics.mjs", () => {
    const content = readSkillSurface("sync");
    assert.ok(content.includes("retrieveHeuristics"), "Must reference retrieveHeuristics");
  });

  it("includes ## Learned Lessons section heading", () => {
    const content = readSkillSurface("sync");
    assert.ok(content.includes("## Learned Lessons"), "Must include ## Learned Lessons section");
  });

  it("places Learned Lessons before User Additions marker", () => {
    const content = readSkillSurface("sync");
    const lessonsIdx = content.indexOf("## Learned Lessons");
    // Use "# User Additions" to avoid matching the comment "above the User Additions line"
    const userAdditionsIdx = content.indexOf("# User Additions");
    assert.ok(lessonsIdx !== -1, "Must contain ## Learned Lessons");
    assert.ok(userAdditionsIdx !== -1, "Must contain # User Additions");
    assert.ok(lessonsIdx < userAdditionsIdx, "## Learned Lessons must appear before # User Additions");
  });

  it("handles _global scope sorting", () => {
    const content = readSkillSurface("sync");
    assert.ok(content.includes("_global"), "Must mention _global scope sort behavior");
  });

  it("documents non-blocking behavior on error", () => {
    const content = readSkillSurface("sync");
    assert.ok(
      content.includes("proceed without") || content.includes("non-blocking"),
      "Must document non-blocking behavior when retrieveHeuristics throws"
    );
  });

  it("documents replacement / re-sync behavior", () => {
    const content = readSkillSurface("sync");
    assert.ok(
      content.includes("replace") || content.includes("replacement"),
      "Must document replace/removal of stale Learned Lessons section on re-sync"
    );
  });

  it("truncates pattern to 80 characters", () => {
    const content = readSkillSurface("sync");
    assert.ok(content.includes("80"), "Must mention 80-char truncation for pattern");
  });

  it("covers cursor and copilot targets", () => {
    const content = readSkillSurface("sync");
    assert.ok(
      content.toLowerCase().includes("cursor") || content.toLowerCase().includes("copilot"),
      "Must mention cursor or copilot append behavior"
    );
  });
});
