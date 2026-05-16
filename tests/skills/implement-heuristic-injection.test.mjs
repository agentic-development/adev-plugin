import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("implement SKILL.md heuristic injection", () => {
  it("Step 1 includes heuristic loading instruction", async () => {
    const content = await readFile("skills/implement/SKILL.md", "utf8");
    // After the inline-Node extraction sweep (PR 8-9), Step 1 invokes the
    // canonical CLI verb instead of importing retrieveHeuristics inline.
    assert.ok(
      content.includes("adev heuristics retrieve"),
      "Step 1 must invoke 'adev heuristics retrieve'",
    );
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
