import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("legacy gates detection", () => {
  it("validate SKILL.md should detect legacy manifest gates", () => {
    const content = readFileSync(join(__dirname, "..", "..", "skills", "validate", "SKILL.md"), "utf8");
    assert.ok(content.includes("Legacy gates") && content.includes("manifest.yaml"),
      "Validate should emit migration warning for legacy manifest gates");
  });

  it("hygiene SKILL.md should detect legacy manifest gates", () => {
    const content = readFileSync(join(__dirname, "..", "..", "skills", "hygiene", "SKILL.md"), "utf8");
    assert.ok(content.includes("Legacy gates") && content.includes("manifest.yaml"),
      "Hygiene should emit migration warning for legacy manifest gates");
  });

  it("migration warning should reference governance/gates.yaml in validate", () => {
    const content = readFileSync(join(__dirname, "..", "..", "skills", "validate", "SKILL.md"), "utf8");
    assert.ok(content.includes("Move gate definitions to governance/gates.yaml"),
      "Validate migration warning should point to governance/gates.yaml");
  });

  it("migration warning should reference governance/gates.yaml in hygiene", () => {
    const content = readFileSync(join(__dirname, "..", "..", "skills", "hygiene", "SKILL.md"), "utf8");
    assert.ok(content.includes("Move gate definitions to governance/gates.yaml"),
      "Hygiene migration warning should point to governance/gates.yaml");
  });
});
