import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
// SKILL.md plus its references/ companions: progressive disclosure moved
// several of these instructions one file out of the body without changing
// the contract, and these are content-presence checks on the instruction.
import { readSkillSurface } from "../helpers.mjs";

// Note: the validate-side "Check 13" contradiction-tracking block was removed
// by check-set-restructure.spec.md (the entire ### Check 13: Success Heuristic
// Extraction section was relocated to hooks/post-validate-extract-heuristics.{sh,mjs}).
// The hook helper does not currently implement the contradiction scan — that
// enrichment is filed as a follow-up against the validation charter. The
// recover-side block below still applies because /adev:recover Step 7 retains
// the heuristic-extraction logic with its contradiction scan unchanged.
describe("contradiction tracking in post-validate hook (migrated from validate Check 13)", () => {
  it("hook helper exists and is non-blocking", async () => {
    const helper = await readFile(
      "hooks/post-validate-extract-heuristics.mjs",
      "utf8",
    );
    assert.ok(
      helper.includes("writeHeuristic"),
      "Hook helper must call writeHeuristic for first-run PASS extraction",
    );
    assert.ok(
      helper.includes("console.warn"),
      "Hook helper must use a non-stdout channel for failure reporting (SEC-2)",
    );
  });
});

describe("contradiction tracking in recover SKILL.md", () => {
  it("Step 7 includes contradiction scan before writeHeuristic", () => {
    const content = readSkillSurface("recover");
    const step7Start = content.indexOf("### Step 7");
    const step7Content = content.slice(step7Start);
    assert.ok(step7Content.includes("addContradiction"), "Step 7 must reference addContradiction");
    assert.ok(step7Content.includes("readHeuristics"), "Step 7 must read existing heuristics");
  });

  it("contradiction scan appears before writeHeuristic in Step 7", () => {
    const content = readSkillSurface("recover");
    const step7Start = content.indexOf("### Step 7");
    const step7Content = content.slice(step7Start);
    const contradictionIdx = step7Content.indexOf("Contradiction Scan");
    const writeIdx = step7Content.indexOf("writeHeuristic");
    assert.ok(contradictionIdx > 0 && contradictionIdx < writeIdx,
      "Contradiction Scan must appear before writeHeuristic in Step 7");
  });
});

describe("consistency: recover SKILL.md retains contradiction-scan semantics", () => {
  // The validate-side prose was relocated by check-set-restructure.spec.md.
  // The remaining cross-skill invariants here apply to recover only — recover
  // is the canonical home for contradiction tracking semantics post-migration.
  it("recover references best-effort semantic comparison", () => {
    const recover = readSkillSurface("recover");
    assert.ok(recover.includes("best-effort"), "Recover must say best-effort");
  });

  it("recover mentions retro as backstop", () => {
    const recover = readSkillSurface("recover");
    assert.ok(
      recover.includes("retro") || recover.includes("backstop"),
      "Recover must mention retro backstop",
    );
  });
});
