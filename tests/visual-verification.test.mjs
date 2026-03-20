import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "./helpers.mjs";

function readSkill(name) {
  return readFileSync(join(PLUGIN_ROOT, "skills", name, "SKILL.md"), "utf8");
}

function readTemplate(name) {
  return readFileSync(join(PLUGIN_ROOT, "templates", name), "utf8");
}

describe("visual verification in live-spec template", () => {
  const template = readTemplate("live-spec-template.md");

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

describe("visual verification in adev-implement", () => {
  const skill = readSkill("adev-implement");

  it("has a Visual Verification step", () => {
    assert.ok(skill.includes("#### 2e. Visual Verification"));
  });

  it("requires Playwright MCP — blocks, does not skip", () => {
    assert.ok(skill.includes("BLOCKED"), "should use BLOCKED language");
    assert.ok(skill.includes("Do not proceed"), "should not allow proceeding without Playwright");
    assert.ok(skill.includes("Do not skip"), "should not allow skipping");
  });

  it("triggers on UI file patterns", () => {
    assert.ok(skill.includes("*.tsx"), "should match .tsx files");
    assert.ok(skill.includes("*.css"), "should match .css files");
    assert.ok(skill.includes("components/**"), "should match components dir");
    assert.ok(skill.includes("app/**/page.*"), "should match page files");
  });

  it("includes a fix loop with max cycles", () => {
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

describe("visual verification in adev-validate", () => {
  const skill = readSkill("adev-validate");

  it("has Check 11: Visual Verification", () => {
    assert.ok(skill.includes("### Check 11: Visual Verification"));
  });

  it("requires Playwright MCP — blocks, does not skip", () => {
    const check11 = skill.slice(
      skill.indexOf("### Check 11"),
      skill.indexOf("## Report Format")
    );
    assert.ok(check11.includes("BLOCK validation"), "should block validation");
    assert.ok(check11.includes("Do not record SKIP"), "should not allow SKIP for UI files");
  });

  it("tests three responsive breakpoints", () => {
    assert.ok(skill.includes("375px"), "should test mobile breakpoint");
    assert.ok(skill.includes("768px"), "should test tablet breakpoint");
    assert.ok(skill.includes("1280px"), "should test desktop breakpoint");
  });

  it("checks dark mode", () => {
    assert.ok(skill.includes("dark mode") || skill.includes("Dark mode"));
  });

  it("includes Check 11 in the report template", () => {
    const reportSection = skill.slice(skill.indexOf("## Report Format"));
    assert.ok(reportSection.includes("## Check 11: Visual Verification"));
    assert.ok(reportSection.includes("Responsive (375px)"));
    assert.ok(reportSection.includes("Dark mode"));
  });

  it("references 11 checks, not 10", () => {
    assert.ok(!skill.includes("10 checks"), "should not reference 10 checks anymore");
    assert.ok(skill.includes("11 checks"), "should reference 11 checks");
  });

  it("lists visual verification in red flags", () => {
    const redFlags = skill.slice(skill.indexOf("## Red Flags"));
    assert.ok(redFlags.includes("Skip visual verification"), "red flags should mention visual verification");
    assert.ok(redFlags.includes("Record SKIP for Check 11"), "red flags should prohibit SKIP for UI files");
  });
});
