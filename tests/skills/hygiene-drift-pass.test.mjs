/**
 * Tests for hygiene SKILL.md Code Drift pass.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/hygiene/SKILL.md");

describe("hygiene SKILL.md Code Drift pass", () => {
  it("contains Code Drift audit pass", () => {
    const content = readSkillSurface("hygiene");
    assert.ok(content.includes("Code Drift") || content.includes("drift_detected"),
      "Should have a Code Drift audit pass");
  });

  it("scans specs for drift_detected: true", () => {
    const content = readSkillSurface("hygiene");
    assert.ok(content.includes("drift_detected"),
      "Should scan for drift_detected field");
  });
});
