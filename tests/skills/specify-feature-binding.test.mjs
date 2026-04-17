import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");

describe("adev:specify SKILL.md — Feature work item binding (Step 5.6)", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/specify/SKILL.md must exist");
  });

  it("SKILL.md includes a Step 5.6 heading for Create Feature Work Item", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Step 5.6") || c.includes("### Step 5.6"),
      "Must include Step 5.6 heading"
    );
    assert.ok(
      c.includes("Feature Work Item") || c.includes("feature work item"),
      "Step 5.6 must reference Feature Work Item creation"
    );
  });

  it("Step 5.6 is placed after Step 5.5 (Update Spec Status) and before Step 6 (Summary)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step55Idx = c.indexOf("Step 5.5");
    const step56Idx = c.indexOf("Step 5.6");
    const step6Idx = c.indexOf("### Step 6: Summary");
    assert.ok(step55Idx !== -1, "Step 5.5 must exist");
    assert.ok(step56Idx !== -1, "Step 5.6 must exist");
    assert.ok(step6Idx !== -1, "Step 6 (Summary) must exist");
    assert.ok(step55Idx < step56Idx, "Step 5.6 must appear after Step 5.5");
    assert.ok(step56Idx < step6Idx, "Step 5.6 must appear before Step 6 Summary");
  });

  it("Step 5.6 documents the tasks.backend skip-if-missing behavior", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    // Extract the Step 5.6 section
    const step56Start = c.indexOf("Step 5.6");
    assert.ok(step56Start !== -1, "Step 5.6 must exist");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("tasks.backend") &&
        (step56Section.includes("skip") || step56Section.includes("absent") || step56Section.includes("not configured")),
      "Step 5.6 must describe skipping when tasks.backend is absent"
    );
  });

  it("Step 5.6 documents the Epic lookup convention using Charter: <module-slug>", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Charter: <module-slug>") || c.includes('Charter: <module'),
      'Must document Epic lookup convention with "Charter: <module-slug>" prefix in notes'
    );
    assert.ok(
      c.includes("parent_id"),
      "Must reference parent_id for Epic-to-Feature linking"
    );
  });

  it("Step 5.6 documents spec_ref as the binding key between Feature and spec", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("spec_ref"),
      "Must mention spec_ref as the binding field"
    );
    assert.ok(
      c.includes("absolute path") || c.includes(".context-index/specs/"),
      "Must describe what spec_ref contains (absolute path to spec file)"
    );
  });

  it("Step 5.6 documents idempotency: update if Feature with same spec_ref exists", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("idempotent") || step56Section.includes("Idempotent") ||
        step56Section.includes("already exists") || step56Section.includes("update") &&
        step56Section.includes("spec_ref"),
      "Step 5.6 must describe idempotent behavior (update instead of creating duplicate)"
    );
    assert.ok(
      step56Section.includes("duplicate") || step56Section.includes("re-run"),
      "Must mention duplicate prevention or re-run safety"
    );
  });

  it("Step 5.6 documents cross-cutting variant (no parent_id, notes flag cross-cutting)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("cross-cutting") || step56Section.includes("cross_cutting"),
      "Step 5.6 must address cross-cutting spec variant"
    );
  });

  it("Step 5.6 documents refactor variant (Feature with migration notes)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("refactor") || step56Section.includes("--refactor"),
      "Step 5.6 must address refactor spec variant"
    );
  });

  it("Step 5.6 documents the next_action value for review-pending specs", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("next_action"),
      "Must reference next_action field"
    );
    assert.ok(
      step56Section.includes("review-pending") ||
        step56Section.includes("/adev:review-specs"),
      "Must specify next_action value for review-pending status"
    );
  });

  it("Step 5.6 documents that spec create failure does not block spec completion", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("block") || step56Section.includes("does not fail") ||
        step56Section.includes("failure logged") || step56Section.includes("not block"),
      "Step 5.6 must document that Feature creation failure does not block spec completion"
    );
  });

  it("Step 5.6 uses getIssueManager and create() with required fields", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step56Start = c.indexOf("Step 5.6");
    const step56Section = c.slice(step56Start);
    assert.ok(
      step56Section.includes("getIssueManager") || step56Section.includes("issue manager"),
      "Must reference getIssueManager or issue manager API"
    );
    assert.ok(
      step56Section.includes('type: "feature"') || step56Section.includes("type: feature") ||
        step56Section.includes("`type`") && step56Section.includes("feature"),
      'Must specify type: "feature" in the create call'
    );
  });
});
