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

  it("CODE_DRIFT gate comes before existing dual drift check", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const driftIdx = content.indexOf("CODE_DRIFT");
    const dualDriftIdx = content.indexOf("Dual drift check");
    assert.ok(driftIdx < dualDriftIdx,
      "CODE_DRIFT should come before the Dual drift check");
  });
});
