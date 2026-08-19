import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "plan", "SKILL.md");
const MODE_ROUTER_PATH = join(PLUGIN_ROOT, "skills", "plan", "references", "mode-router.md");
const REVIEWER_PATH = join(PLUGIN_ROOT, "skills", "plan", "references", "plan-reviewer-prompt.md");
const COMPANION_DIR = join(PLUGIN_ROOT, "skills", "plan", "references");

/** Read SKILL.md + all companion mode files */
function readFullSkill() {
  let content = readSkillSurface("plan");
  for (const f of ["feature-mode.md", "release-mode.md", "milestone-mode.md", "epic-mode.md", "milestone-mode.md"]) {
    const p = join(COMPANION_DIR, f);
    if (existsSync(p)) content += "\n" + readFileSync(p, "utf8");
  }
  return content;
}

describe("adev:plan SKILL.md — multi-scope mode detection and per-mode flows", () => {
  let content;

  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/plan/SKILL.md must exist");
    // Load SKILL.md + all companion mode files for content assertions
    content = readSkillSurface("plan");
    for (const f of ["feature-mode.md", "release-mode.md", "milestone-mode.md", "epic-mode.md", "milestone-mode.md"]) {
      const p = join(COMPANION_DIR, f);
      if (existsSync(p)) content += "\n" + readFileSync(p, "utf8");
    }
  });

  // --- Mode detection section ---

  it("SKILL.md has a Mode Detection section before the Review Gate", () => {
    const c = readFullSkill();
    const modeIdx = c.indexOf("## Mode Detection") !== -1
      ? c.indexOf("## Mode Detection")
      : c.indexOf("## Step 0");
    assert.ok(
      modeIdx !== -1,
      "Must include a '## Mode Detection' or '## Step 0' section"
    );
    const reviewGateIdx = c.indexOf("## Step 1: Review Gate");
    assert.ok(
      reviewGateIdx !== -1,
      "Step 1: Review Gate must still exist"
    );
    assert.ok(
      modeIdx < reviewGateIdx,
      "Mode Detection must appear before Step 1: Review Gate"
    );
  });

  it("SKILL.md documents all five explicit flags in the Arguments or Mode Detection section", () => {
    const c = readFullSkill();
    assert.ok(c.includes("--spec"), "Must document --spec flag");
    assert.ok(c.includes("--feature"), "Must document --feature flag");
    assert.ok(c.includes("--release"), "Must document --release flag");
    assert.ok(c.includes("--milestone"), "Must document --milestone flag");
    assert.ok(c.includes("--epic"), "Must document --epic flag");
  });

  it("SKILL.md documents mode detection precedence: explicit flag wins", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Explicit flag") || c.includes("explicit flag") || c.includes("flag wins"),
      "Must state that explicit flags win over keyword/state detection"
    );
  });

  it("SKILL.md documents keyword-based mode detection (e.g. 'plan release v2')", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("keyword") || c.includes("free-text"),
      "Must describe keyword or free-text detection"
    );
    assert.ok(
      c.includes("release") && (c.includes("v2") || c.includes("<name>")),
      "Must give a concrete keyword-detection example (release)"
    );
  });

  it("SKILL.md documents path-argument detection routing to spec mode", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes(".md") && (c.includes("path argument") || c.includes("file path") || c.includes("spec path")),
      "Must describe path-argument detection for spec mode"
    );
  });

  it("SKILL.md documents project-state scan when no flag and no argument", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("project state") || c.includes("scan"),
      "Must describe project-state scanning when no flag and no argument"
    );
  });

  it("SKILL.md documents multi-choice menu fallback on ambiguity", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("multi-choice") || c.includes("menu") || c.includes("ambiguous"),
      "Must document multi-choice menu fallback for ambiguous input"
    );
  });

  it("SKILL.md documents CONFLICTING_FLAGS error when multiple mode flags are passed", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("CONFLICTING_FLAGS"),
      "Must document CONFLICTING_FLAGS error code"
    );
  });

  // --- Per-mode sections ---

  it("SKILL.md has a Spec Mode section", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Spec Mode") || c.includes("### Spec Mode"),
      "Must include a Spec Mode section"
    );
  });

  it("SKILL.md has a Feature Mode section", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Feature Mode") || c.includes("### Feature Mode"),
      "Must include a Feature Mode section"
    );
  });

  it("SKILL.md has a Release Mode section", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Release Mode") || c.includes("### Release Mode"),
      "Must include a Release Mode section"
    );
  });

  it("SKILL.md has a Milestone Mode section", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Milestone Mode") || c.includes("### Milestone Mode"),
      "Must include a Milestone Mode section"
    );
  });

  it("SKILL.md has an Epic Mode section", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("Epic Mode") || c.includes("### Epic Mode"),
      "Must include an Epic Mode section"
    );
  });

  // --- next_action convention table ---

  it("SKILL.md includes the next_action convention table", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("next_action") && (c.includes("convention") || c.includes("Convention")),
      "Must include next_action convention table or section"
    );
  });

  it("SKILL.md next_action table includes Task placeholder token", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("/adev:implement") && c.includes("RED-GREEN-REFACTOR"),
      "Task next_action must reference /adev:implement and RED-GREEN-REFACTOR"
    );
  });

  it("SKILL.md next_action table includes Feature without spec placeholder token", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("/adev:specify") && c.includes("<module>"),
      "Feature-without-spec next_action must reference /adev:specify and <module>"
    );
  });

  it("SKILL.md next_action table includes Feature with reviewed spec placeholder using <spec_ref>", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("<spec_ref>"),
      "Must use <spec_ref> token (not <path>) in next_action convention table"
    );
  });

  it("SKILL.md next_action table includes Epic placeholders using <id> token", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("<id>") || c.includes("--epic <id>"),
      "Must use <id> token for Epic next_action entries"
    );
  });

  // --- Spec mode gate preserved ---

  it("SKILL.md Spec Mode gate still requires *.review.md to exist and pass", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("review.md") || c.includes(".review.md"),
      "Spec mode must still gate on review file"
    );
    assert.ok(
      c.includes("REVIEW_GATE"),
      "Must document REVIEW_GATE error code"
    );
  });

  it("SKILL.md Feature Mode documents CHARTER_GATE error for missing or draft charters", () => {
    const c = readFullSkill();
    assert.ok(
      c.includes("CHARTER_GATE"),
      "Must document CHARTER_GATE error code in Feature Mode"
    );
  });

  // --- Feature mode create() calls ---

  it("SKILL.md Feature Mode documents create() calls with next_action", () => {
    const c = readFullSkill();
    // Find the dedicated "## Feature Mode" heading (not the Arguments mention)
    const featureModeHeadingIdx = c.indexOf("## Feature Mode");
    assert.ok(featureModeHeadingIdx !== -1, "## Feature Mode section must exist");
    // Slice from the heading to end of file
    const featureSection = c.slice(featureModeHeadingIdx);
    assert.ok(
      featureSection.includes("create(") || featureSection.includes("create({"),
      "Feature Mode must document create() calls"
    );
  });

  // --- Release mode ---

  it("SKILL.md Release Mode references product.md and walkTree", () => {
    const c = readFullSkill();
    const releaseModeHeadingIdx = c.indexOf("## Release Mode");
    assert.ok(releaseModeHeadingIdx !== -1, "## Release Mode must exist");
    // Slice from the heading to end of file
    const releaseSection = c.slice(releaseModeHeadingIdx);
    assert.ok(
      releaseSection.includes("product.md"),
      "Release Mode must reference product.md"
    );
    assert.ok(
      releaseSection.includes("walkTree"),
      "Release Mode must reference walkTree for reconciliation"
    );
  });

  // --- mode-router.md ---

  it("mode-router.md companion file exists", () => {
    assert.ok(
      existsSync(MODE_ROUTER_PATH),
      "skills/plan/references/mode-router.md must exist"
    );
  });

  it("mode-router.md documents detection precedence order", () => {
    const c = readFileSync(MODE_ROUTER_PATH, "utf8");
    assert.ok(
      c.includes("precedence") || c.includes("Precedence"),
      "mode-router.md must describe detection precedence"
    );
    assert.ok(
      c.includes("explicit") && c.includes("keyword") && c.includes("state"),
      "mode-router.md must cover explicit flag, keyword, and state detection steps"
    );
  });

  it("mode-router.md includes concrete keyword examples", () => {
    const c = readFileSync(MODE_ROUTER_PATH, "utf8");
    assert.ok(
      c.includes("release") && c.includes("milestone") && c.includes("feature"),
      "mode-router.md must include concrete keyword examples for each mode"
    );
  });

  it("mode-router.md documents multi-choice fallback rules", () => {
    const c = readFileSync(MODE_ROUTER_PATH, "utf8");
    assert.ok(
      c.includes("multi-choice") || c.includes("menu") || c.includes("fallback"),
      "mode-router.md must document multi-choice or fallback rules"
    );
  });

  // --- plan-reviewer-prompt.md updated for multi-scope ---

  it("plan-reviewer-prompt.md documents scope-aware review (not just spec-tasks)", () => {
    const c = readFileSync(REVIEWER_PATH, "utf8");
    assert.ok(
      c.includes("scope") || c.includes("mode") || c.includes("Feature") || c.includes("Release") || c.includes("Milestone"),
      "plan-reviewer-prompt.md must validate plans at any scope, not just spec-tasks"
    );
  });
});
