import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skillContent = readSkillSurface("hygiene");

describe("hygiene SKILL.md Pass 16", () => {
  it("defines Pass 16: Heuristic Index Health (+7 more contract assertions)", () => {
    // defines Pass 16: Heuristic Index Health
    assert.ok(skillContent.includes("Pass 16") || skillContent.includes("Audit Pass 16"));

    // defines STALE_INDEX check
    assert.ok(skillContent.includes("STALE_INDEX"));

    // defines ORPHAN_TAG check
    assert.ok(skillContent.includes("ORPHAN_TAG"));

    // supports --check heuristics flag
    assert.ok(skillContent.includes("heuristics") && skillContent.includes("--check"));

    // supports --fix auto-sync for STALE_INDEX
    assert.ok(skillContent.includes("--fix") && skillContent.includes("sync"));

    // reports SKIP when store directory missing
    assert.ok(skillContent.includes("SKIP") || skillContent.includes("No heuristic store"));

    // references retrieveHeuristics or readHeuristics
    assert.ok(skillContent.includes("retrieveHeuristics") || skillContent.includes("readHeuristics"));

    // references Learned Lessons section in sync targets
    assert.ok(skillContent.includes("Learned Lessons"));
  });
});
