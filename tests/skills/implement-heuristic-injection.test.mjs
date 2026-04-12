import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("implement SKILL.md heuristic injection", () => {
  it("Step 1 includes heuristic loading instruction", async () => {
    const content = await readFile("skills/implement/SKILL.md", "utf8");
    assert.ok(content.includes("retrieveHeuristics"), "Step 1 must reference retrieveHeuristics");
    assert.ok(content.includes("renderHeuristic"), "Step 1 must reference renderHeuristic");
    assert.ok(content.includes("lib/heuristics.mjs"), "Step 1 must reference lib/heuristics.mjs");
  });

  it("Step 2a includes heuristics section instruction", async () => {
    const content = await readFile("skills/implement/SKILL.md", "utf8");
    assert.ok(content.includes("## Heuristics"), "Step 2a must describe heuristics section");
    assert.ok(content.includes("guidance, not as hard rules"), "Must include preamble text");
  });

  it("documents non-blocking behavior", async () => {
    const content = await readFile("skills/implement/SKILL.md", "utf8");
    assert.ok(
      content.includes("non-blocking") || content.includes("proceed without heuristics"),
      "Must document non-blocking semantics"
    );
  });

  it("references injection_limit configuration", async () => {
    const content = await readFile("skills/implement/SKILL.md", "utf8");
    assert.ok(content.includes("injection_limit"), "Must reference configurable limit");
  });
});
