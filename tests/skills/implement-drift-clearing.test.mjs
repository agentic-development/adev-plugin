/**
 * Tests for implement SKILL.md drift clearing instruction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/implement/SKILL.md");

describe("implement SKILL.md drift clearing instruction", () => {
  it("contains clearDrift instruction", () => {
    const content = readSkillSurface("implement");
    assert.ok(content.includes("clearDrift"), "SKILL.md should reference clearDrift");
  });

  it("clearDrift is called after computeManifest (correct ordering)", () => {
    const content = readSkillSurface("implement");
    const manifestIdx = content.indexOf("source manifest");
    const clearIdx = content.indexOf("clearDrift");
    assert.ok(clearIdx > manifestIdx, "clearDrift should come after source manifest");
  });
});
