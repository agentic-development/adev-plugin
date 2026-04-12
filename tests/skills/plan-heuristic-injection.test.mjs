import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("plan SKILL.md heuristic injection", () => {
  it("Step 2 includes heuristic loading instruction", async () => {
    const content = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(content.includes("retrieveHeuristics"), "Must reference retrieveHeuristics");
    assert.ok(content.includes("lib/heuristics.mjs"), "Must reference lib/heuristics.mjs");
  });

  it("Context Packet Section includes Heuristics entry template", async () => {
    const content = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(content.includes("- Heuristics:"), "Must include Heuristics entry in context packets");
  });

  it("plan output includes ## Heuristics section template", async () => {
    const content = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(content.includes("## Heuristics"), "Must include Heuristics section");
    assert.ok(content.includes("review convenience"), "Must note snapshot is for review convenience");
  });

  it("documents non-blocking semantics", async () => {
    const content = await readFile("skills/plan/SKILL.md", "utf8");
    assert.ok(
      content.includes("proceed without heuristics") || content.includes("non-blocking"),
      "Must document non-blocking behavior"
    );
  });
});
