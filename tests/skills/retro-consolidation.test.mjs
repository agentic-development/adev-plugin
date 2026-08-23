import { readSkillSurface } from "../helpers.mjs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("retro SKILL.md heuristic consolidation", () => {
  it("Step 1 includes heuristic data gathering (1.7)", () => {
    const content = readSkillSurface("retro");
    assert.ok(content.includes("1.7") && content.includes("euristic"),
      "Step 1 must include heuristic gathering section");
    assert.ok(content.includes("readHeuristics"), "Must use readHeuristics API");
    assert.ok(content.includes("modules"), "Must iterate over manifest modules");
  });

  it("Step 2 includes heuristic health analysis", () => {
    const content = readSkillSurface("retro");
    assert.ok(content.includes("staleness") || content.includes("stale"),
      "Must analyze staleness");
    assert.ok(content.includes("duplicate"), "Must detect duplicates");
    assert.ok(content.includes("contradicted"), "Must report contradicted entries");
    assert.ok(content.includes("staleness_days"), "Must reference configurable staleness threshold");
  });

  it("Step 3 includes consolidation recommendations", () => {
    const content = readSkillSurface("retro");
    assert.ok(
      content.includes("Archive stale") || content.includes("archive stale"),
      "Must recommend archiving stale heuristics"
    );
    assert.ok(
      content.includes("Merge duplicate") || content.includes("merge duplicate") || content.includes("merged-duplicate"),
      "Must recommend merging duplicates"
    );
  });

  it("Step 4 includes stale archival for --auto-apply", () => {
    const content = readSkillSurface("retro");
    assert.ok(content.includes("archiveHeuristic"), "Must call archiveHeuristic for stale entries");
    assert.ok(
      content.includes("'stale'") || content.includes('"stale"'),
      'Must use reason "stale"'
    );
  });

  it("Step 4 does NOT auto-merge or auto-promote", () => {
    const content = readSkillSurface("retro");
    assert.ok(
      content.includes("NOT") || content.includes("not auto"),
      "Must explicitly state no auto-merge/promote"
    );
  });

  it("Step 5 report includes Heuristic Health subsection", () => {
    const content = readSkillSurface("retro");
    assert.ok(
      content.includes("### Heuristic Health") || content.includes("Heuristic Health"),
      "Report must include Heuristic Health subsection"
    );
  });

  it("uses readHeuristics API, not raw directory scan", () => {
    const content = readSkillSurface("retro");
    assert.ok(content.includes("readHeuristics"), "Must use readHeuristics API");
  });
});
