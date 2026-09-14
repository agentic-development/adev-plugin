import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readSkillSurface } from "../helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("hygiene SKILL.md — Pass 8 unified schema", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "hygiene", "SKILL.md");
  const content = readSkillSurface("hygiene");

  it("should validate tier values (fast/integration/e2e)", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(pass8Section.includes("INVALID_TIER"),
      "Pass 8 should flag invalid tier values");
  });

  it("should validate severity values (error/warning)", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(pass8Section.includes("INVALID_SEVERITY"),
      "Pass 8 should flag invalid severity values");
  });

  it("should check for duplicate gate IDs", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(pass8Section.includes("DUPLICATE_GATE_ID"),
      "Pass 8 should check for duplicate gate IDs");
  });

  it("should not reference manifest gates as fallback", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(!pass8Section.includes("using manifest gates"),
      "Pass 8 should not reference manifest gates fallback");
  });

  it("should check for empty gates list", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(pass8Section.includes("EMPTY_GATES"),
      "Pass 8 should flag empty gates list");
  });

  it("should suggest /adev:init when governance absent", () => {
    const pass8Section = content.substring(content.indexOf("Pass 8"));
    assert.ok(pass8Section.includes("/adev:init"),
      "Should suggest running /adev:init when governance absent");
  });
});
