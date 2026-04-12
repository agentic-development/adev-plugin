import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("contradiction tracking in validate SKILL.md", () => {
  it("Check 12 includes contradiction scan before writeHeuristic", async () => {
    const content = await readFile("skills/validate/SKILL.md", "utf8");
    assert.ok(content.includes("addContradiction"), "Must reference addContradiction");
    assert.ok(content.includes("readHeuristics"), "Must read existing heuristics for comparison");
  });

  it("contradiction scan appears before writeHeuristic in Check 12", async () => {
    const content = await readFile("skills/validate/SKILL.md", "utf8");
    const check12Start = content.indexOf("### Check 12");
    const check12Content = content.slice(check12Start);
    const contradictionIdx = check12Content.indexOf("Contradiction Scan");
    const writeIdx = check12Content.indexOf("writeHeuristic");
    assert.ok(contradictionIdx > 0 && contradictionIdx < writeIdx,
      "Contradiction Scan must appear before writeHeuristic in Check 12");
  });

  it("documents non-blocking error handling", async () => {
    const content = await readFile("skills/validate/SKILL.md", "utf8");
    const check12Start = content.indexOf("### Check 12");
    const check12Content = content.slice(check12Start);
    assert.ok(
      check12Content.includes("try/catch") || check12Content.includes("catch"),
      "Must document try/catch for addContradiction"
    );
  });
});

describe("contradiction tracking in recover SKILL.md", () => {
  it("Step 7 includes contradiction scan before writeHeuristic", async () => {
    const content = await readFile("skills/recover/SKILL.md", "utf8");
    const step7Start = content.indexOf("### Step 7");
    const step7Content = content.slice(step7Start);
    assert.ok(step7Content.includes("addContradiction"), "Step 7 must reference addContradiction");
    assert.ok(step7Content.includes("readHeuristics"), "Step 7 must read existing heuristics");
  });

  it("contradiction scan appears before writeHeuristic in Step 7", async () => {
    const content = await readFile("skills/recover/SKILL.md", "utf8");
    const step7Start = content.indexOf("### Step 7");
    const step7Content = content.slice(step7Start);
    const contradictionIdx = step7Content.indexOf("Contradiction Scan");
    const writeIdx = step7Content.indexOf("writeHeuristic");
    assert.ok(contradictionIdx > 0 && contradictionIdx < writeIdx,
      "Contradiction Scan must appear before writeHeuristic in Step 7");
  });
});

describe("consistency across both skills", () => {
  it("both skills reference best-effort semantic comparison", async () => {
    const validate = await readFile("skills/validate/SKILL.md", "utf8");
    const recover = await readFile("skills/recover/SKILL.md", "utf8");
    assert.ok(validate.includes("best-effort"), "Validate must say best-effort");
    assert.ok(recover.includes("best-effort"), "Recover must say best-effort");
  });

  it("both skills mention retro as backstop", async () => {
    const validate = await readFile("skills/validate/SKILL.md", "utf8");
    const recover = await readFile("skills/recover/SKILL.md", "utf8");
    assert.ok(validate.includes("retro") || validate.includes("backstop"),
      "Validate must mention retro backstop");
    assert.ok(recover.includes("retro") || recover.includes("backstop"),
      "Recover must mention retro backstop");
  });
});
