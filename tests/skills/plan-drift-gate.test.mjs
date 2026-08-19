/**
 * Tests for plan SKILL.md CODE_DRIFT gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/plan/SKILL.md");

describe("plan SKILL.md drift gate", () => {
  it("contains CODE_DRIFT gate instruction", () => {
    const content = readSkillSurface("plan");
    assert.ok(content.includes("CODE_DRIFT"), "SKILL.md should reference CODE_DRIFT");
  });

  it("contains hasDrift check", () => {
    const content = readSkillSurface("plan");
    assert.ok(content.includes("hasDrift"), "SKILL.md should reference hasDrift");
  });

  it("contains verifyManifest fallback for non-Claude-Code hosts", () => {
    const content = readSkillSurface("plan");
    assert.ok(content.includes("verifyManifest"), "SKILL.md should reference verifyManifest fallback");
  });

  it("CODE_DRIFT gate is enforced before the planning step is recorded", () => {
    // The legacy "Dual drift check" was removed by the lifecycle-skill
    // instruction adoption pass. CODE_DRIFT is now part of the Step 1
    // prerequisite block alongside requireGate("review"). Verify it
    // appears before the step-started event (per inline-Node extraction
    // sweep PR 3, the inline `reportStep(...)` block was replaced with
    // the `adev report --type step ... --status started` CLI call) so a
    // drifted spec cannot have its plan step opened.
    const content = readSkillSurface("plan");
    const driftIdx = content.indexOf("CODE_DRIFT");
    // Match either the legacy `reportStep(...)` JS form OR the new CLI form
    // emitted by Task 3 of the inline-Node extraction sweep.
    const legacyRe = /reportStep\([^)]*step:\s*["']plan["'][^)]*status:\s*["']started["']/;
    const cliRe = /adev\s+report\s+--type\s+step[\s\S]*?--step\s+plan[\s\S]*?--status\s+started/;
    let reportStepIdx = content.search(legacyRe);
    if (reportStepIdx < 0) reportStepIdx = content.search(cliRe);
    assert.ok(driftIdx >= 0, "CODE_DRIFT prerequisite must exist");
    assert.ok(reportStepIdx >= 0, "step-started entry must exist (reportStep JS or `adev report --type step ... --status started`)");
    assert.ok(driftIdx < reportStepIdx,
      "CODE_DRIFT prerequisite should come before the step-started entry");
  });
});
