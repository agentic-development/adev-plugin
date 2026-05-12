/**
 * Tests for plan SKILL.md CODE_DRIFT gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/plan/SKILL.md");

describe("plan SKILL.md drift gate", () => {
  it("contains CODE_DRIFT gate instruction", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("CODE_DRIFT"), "SKILL.md should reference CODE_DRIFT");
  });

  it("contains hasDrift check", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("hasDrift"), "SKILL.md should reference hasDrift");
  });

  it("contains verifyManifest fallback for non-Claude-Code hosts", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("verifyManifest"), "SKILL.md should reference verifyManifest fallback");
  });

  it("CODE_DRIFT gate is enforced before the planning step is recorded", () => {
    // The legacy "Dual drift check" was removed by the lifecycle-skill
    // instruction adoption pass. CODE_DRIFT is now part of the Step 1
    // prerequisite block alongside requireGate("review"). Verify it
    // appears before the reportStep("plan", "started") entry event so a
    // drifted spec cannot have its plan step opened.
    const content = readFileSync(SKILL_PATH, "utf-8");
    const driftIdx = content.indexOf("CODE_DRIFT");
    const reportStepIdx = content.search(/reportStep\([^)]*step:\s*["']plan["'][^)]*status:\s*["']started["']/);
    assert.ok(driftIdx >= 0, "CODE_DRIFT prerequisite must exist");
    assert.ok(reportStepIdx >= 0, "reportStep(plan, started) entry must exist");
    assert.ok(driftIdx < reportStepIdx,
      "CODE_DRIFT prerequisite should come before reportStep(plan, started)");
  });
});
