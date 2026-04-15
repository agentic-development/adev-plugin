import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("init SKILL.md — governance scaffolding", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "init", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  it("should scaffold governance/gates.yaml from template", () => {
    assert.ok(content.includes("gates.yaml") && content.includes("template"),
      "Init should generate gates.yaml from template");
  });

  it("should detect legacy gates in manifest.yaml", () => {
    assert.ok(content.includes("Legacy gates") || content.includes("legacy gates"),
      "Init should detect legacy gates: section in manifest");
  });

  it("should offer migration path for legacy gates", () => {
    assert.ok(content.includes("governance/gates.yaml"),
      "Init should reference governance/gates.yaml for migration");
  });
});
