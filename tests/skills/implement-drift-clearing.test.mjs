/**
 * Tests for implement SKILL.md drift clearing instruction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/implement/SKILL.md");

describe("implement SKILL.md drift clearing instruction", () => {
  it("contains clearDrift instruction", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("clearDrift"), "SKILL.md should reference clearDrift");
  });

  it("clearDrift is called after computeManifest (correct ordering)", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const manifestIdx = content.indexOf("source manifest");
    const clearIdx = content.indexOf("clearDrift");
    assert.ok(clearIdx > manifestIdx, "clearDrift should come after source manifest");
  });
});
