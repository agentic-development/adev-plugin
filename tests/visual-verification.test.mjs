import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "./helpers.mjs";

// Reads SKILL.md plus its references/ companions: these assertions are about
// instructions the skill ships, which progressive disclosure moved one file out.
function readSkill(name) {
  return readSkillSurface(name);
}

function readTemplate(name) {
  return readFileSync(join(PLUGIN_ROOT, "templates", name), "utf8");
}

describe("visual verification in live-spec template", () => {
  const template = readTemplate("spec-template.behavioral.md");

  it("has a Visual Expectations section", () => {
    assert.ok(template.includes("## Visual Expectations"));
  });

  it("includes loading, error, and mobile prompts", () => {
    assert.ok(template.includes("Loading state"), "should prompt for loading state");
    assert.ok(template.includes("Error state"), "should prompt for error state");
    assert.ok(template.includes("Mobile"), "should prompt for mobile behavior");
  });

  it("Visual Expectations appears before Acceptance Criteria", () => {
    const veIndex = template.indexOf("## Visual Expectations");
    const acIndex = template.indexOf("## Acceptance Criteria");
    assert.ok(veIndex < acIndex, "Visual Expectations should come before Acceptance Criteria");
  });
});

describe("visual verification in adev:implement", () => {
  const skill = readSkill("implement");

  it("has a Visual Verification step (+3 more contract assertions)", () => {
    // has a Visual Verification step
    assert.ok(skill.includes("#### 2e. Visual Verification"));

    // requires Playwright MCP — blocks, does not skip
    assert.ok(skill.includes("BLOCKED"), "should use BLOCKED language");
    assert.ok(skill.includes("Do not proceed"), "should not allow proceeding without Playwright");
    assert.ok(skill.includes("Do not skip"), "should not allow skipping");

    // triggers on UI file patterns
    assert.ok(skill.includes("*.tsx"), "should match .tsx files");
    assert.ok(skill.includes("*.css"), "should match .css files");
    assert.ok(skill.includes("components/**"), "should match components dir");
    assert.ok(skill.includes("app/**/page.*"), "should match page files");

    // includes a fix loop with max cycles
    assert.ok(skill.includes("Maximum 3 visual fix cycles"), "should cap fix iterations");
  });

  it("requires baseline check even without Visual Expectations", () => {
    assert.ok(
      skill.includes("If the spec has no Visual Expectations section"),
      "should handle missing Visual Expectations"
    );
    assert.ok(skill.includes("blank screen"), "should check for blank screen");
    assert.ok(skill.includes("console errors"), "should check for console errors");
  });

  it("lists visual verification in red flags", () => {
    const redFlags = skill.slice(skill.indexOf("## Red Flags"));
    assert.ok(redFlags.includes("Skip visual verification"), "red flags should mention visual verification");
    assert.ok(redFlags.includes("Playwright MCP"), "red flags should mention Playwright requirement");
  });
});

describe("visual verification in adev:validate", () => {
  const skill = readSkill("validate");

  it("has Check 11: Visual Verification", () => {
    assert.ok(skill.includes("### Check 11: Visual Verification"));
  });

  it("SKILL.md routes to the Check 11 companion", () => {
    // A companion nothing references is dead weight -- exactly what splitting
    // a body into references/ can silently create.
    const body = readFileSync(
      join(PLUGIN_ROOT, "skills", "validate", "SKILL.md"), "utf8",
    );
    assert.ok(
      body.includes("checks-orchestration/check-11-visual-verification.md"),
      "validate/SKILL.md must name the Check 11 companion",
    );
  });

  it("BLOCKs when UI files match AND Playwright is absent (Case B); SKIPs when no UI files (Cases A/D)", () => {
    // check-set-restructure.spec.md Behaviors 5 + 6: BLOCK preserved only when
    // UI files are in the diff. The Case A SKIP path is new; before the
    // restructure this case BLOCKed even on non-UI specs.
    // Check 11's body lives in its own companion (progressive disclosure), so
    // the whole file IS the section -- no heading-slicing needed.
    const check11 = readFileSync(
      join(PLUGIN_ROOT, "skills", "validate", "references",
           "checks-orchestration", "check-11-visual-verification.md"),
      "utf8",
    );
    assert.ok(/BLOCK/i.test(check11), "should still cite BLOCK for the UI+no-Playwright case");
    assert.ok(/SKIP/.test(check11), "should permit SKIP for the no-UI-files case after the trigger-guard restructure");
  });

  it("tests three responsive breakpoints (+1 more contract assertions)", () => {
    // tests three responsive breakpoints
    assert.ok(skill.includes("375px"), "should test mobile breakpoint");
    assert.ok(skill.includes("768px"), "should test tablet breakpoint");
    assert.ok(skill.includes("1280px"), "should test desktop breakpoint");

    // checks dark mode
    assert.ok(skill.includes("dark mode") || skill.includes("Dark mode"));
  });

  it("includes Check 11 in the report template", () => {
    const reportSection = skill.slice(skill.indexOf("## Report Format"));
    assert.ok(reportSection.includes("## Check 11: Visual Verification"));
    assert.ok(reportSection.includes("Responsive (375px)"));
    assert.ok(reportSection.includes("Dark mode"));
  });

  it("references the trimmed post-restructure check inventory, not the historic 11 or 13 count", () => {
    // After check-set-restructure.spec.md the surviving check inventory is
    // not pinned to a single integer (it depends on optional governance
    // and conditional UI/Playwright matching). Assert the migration-orientation
    // footer is present instead of pinning to a stale number.
    assert.ok(
      skill.includes("/adev:hygiene") &&
        skill.includes("/adev:reconcile") &&
        skill.includes("/adev:review-specs"),
      "should carry the migration-orientation footer pointing at relocation destinations"
    );
    assert.ok(
      !/All 13 checks passed/.test(skill),
      "should not retain the stale 'All 13 checks passed' phrasing"
    );
  });

  it("lists visual verification in red flags", () => {
    const redFlags = skill.slice(skill.indexOf("## Red Flags"));
    assert.ok(redFlags.includes("Skip visual verification"), "red flags should mention visual verification");
    assert.ok(redFlags.includes("Record SKIP for Check 11"), "red flags should prohibit SKIP for UI files");
  });
});
