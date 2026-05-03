/**
 * Tests for validate SKILL.md drift warning.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(__dirname, "../../skills/validate/SKILL.md");

describe("validate SKILL.md drift warning", () => {
  it("contains drift_detected warning instruction", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("drift_detected"), "Should reference drift_detected");
  });

  it("drift check is non-blocking (warns, does not fail)", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("non-blocking") || content.includes("WARN"),
      "Should indicate drift check is non-blocking");
  });

  it("contains verifyManifest fallback", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("verifyManifest"), "Should reference verifyManifest fallback");
  });

  it("emits explicit warning on unreadable frontmatter", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    assert.ok(content.includes("frontmatter unreadable") || content.includes("CODE_DRIFT_READ_ERROR"),
      "Should handle unreadable frontmatter explicitly");
  });
});
