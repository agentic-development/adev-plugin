import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("build SKILL.md — unified dry-run gates", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "build", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  it("should read gate display from governance/gates.yaml in dry-run", () => {
    assert.ok(content.includes("governance/gates.yaml"),
      "Dry-run should read from governance/gates.yaml");
  });

  it("should NOT read gates from manifest.yaml for display", () => {
    const idx = content.indexOf("Gate tier summary");
    const sectionEndIdx = idx >= 0 ? content.indexOf("\n---\n", idx) : -1;
    const dryRunSection = idx >= 0
      ? content.substring(idx, sectionEndIdx > 0 ? sectionEndIdx : idx + 800)
      : "";
    assert.ok(!dryRunSection.includes("manifest.yaml"),
      "Dry-run gate display section should not reference manifest.yaml");
  });

  it("should delegate gate execution to implement and validate", () => {
    assert.ok(content.includes("delegate") || content.includes("Delegation"),
      "Build should delegate gate execution to consuming skills");
  });
});
