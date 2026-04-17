import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("validate SKILL.md — unified gate system", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "validate", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  it("should NOT have manifest fallback for gate resolution", () => {
    assert.ok(!content.includes("If governance does not exist → read `manifest.yaml`"),
      "Should not have governance-to-manifest fallback");
    assert.ok(!content.includes("Tiered Gate Resolution (manifest.yaml)"),
      "Should not have manifest tiered gate resolution section");
  });

  it("should read gates exclusively from governance/gates.yaml with tiered execution", () => {
    assert.ok(content.includes("governance/gates.yaml") && content.includes("group"),
      "Should read from governance/gates.yaml and group by tier");
    assert.ok(!content.includes("Governance gates always execute as a flat Check 1"),
      "Should not describe governance gates as flat-only execution");
  });

  it("should report SKIP when governance/gates.yaml is absent", () => {
    assert.ok(content.includes("No governance/gates.yaml found"),
      "Should report SKIP with advisory when gates.yaml missing");
  });

  it("should report SKIP for Check 8 when governance directory absent", () => {
    assert.ok(content.includes("No governance directory configured"),
      "Check 8 should SKIP when governance/ directory absent");
  });

  it("should report SKIP for Check 9 when no transitions", () => {
    assert.ok(content.includes("No transitions configured"),
      "Check 9 should SKIP when no transitions");
  });

  it("should include skip count in summary", () => {
    assert.ok(content.includes("skipped checks"),
      "Report summary should count skipped checks");
  });

  it("should handle required: false forcing severity: warning", () => {
    assert.ok(content.includes("required: false") && content.includes("severity: warning"),
      "Should document required:false → severity:warning rule");
  });

  it("should restrict --fix auto-fix to fast tier only", () => {
    assert.ok(content.includes("--fix") && content.includes("fast tier"),
      "Should document --fix applies only to fast tier");
    assert.ok(content.includes("never auto-fixed"),
      "Should document integration/e2e are never auto-fixed");
  });

  it("should skip undefined tiers with informational note", () => {
    assert.ok(content.includes("no gates configured, skipped"),
      "Should skip undefined tiers with informational note");
  });
});
