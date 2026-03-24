import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "adev-document", "SKILL.md");

describe("adev-document skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/adev-document/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev-document"), "Must have name field");
    assert.ok(content.includes("description:"), "Must have description field");
  });

  it("SKILL.md contains architecture generation section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("architecture.md"), "Must reference architecture.md output");
    assert.ok(content.includes("dependency-graph.json"), "Must reference dependency-graph.json input");
    assert.ok(content.includes("adev:generated"), "Must define the generated content marker");
    assert.ok(content.includes("adev:human"), "Must define the human content marker");
  });

  // Acceptance criterion #5: entry points from dependency-graph.json (not symbol-ranks.json)
  it("SKILL.md sources entry points from dependency-graph.json", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const afterEntryPoint = content.slice(content.toLowerCase().indexOf("entry point"));
    assert.ok(
      afterEntryPoint.includes("dependency-graph.json"),
      "Entry points section must reference dependency-graph.json"
    );
    assert.ok(
      afterEntryPoint.includes("zero inbound") ||
      afterEntryPoint.includes("zero-inbound") ||
      afterEntryPoint.includes("no inbound"),
      "Entry points instruction must describe zero-inbound-edge files"
    );
  });

  // Acceptance criterion #6: ADR links
  it("SKILL.md instructs scanning .context-index/adrs/ for ADR links", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes(".context-index/adrs/"), "Must reference .context-index/adrs/ for ADR links");
    assert.ok(content.includes(".template.md") || content.includes("excluding"), "Must exclude .template.md from ADR scan");
  });

  // Acceptance criterion #7: marker preservation — both markers defined with canonical order
  it("SKILL.md defines canonical two-zone marker layout", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const generatedIdx = content.indexOf("adev:generated");
    const humanIdx = content.indexOf("adev:human");
    assert.ok(generatedIdx !== -1, "Must define adev:generated marker");
    assert.ok(humanIdx !== -1, "Must define adev:human marker");
    // In the canonical layout definition, adev:generated appears before adev:human
    assert.ok(generatedIdx < humanIdx, "Canonical layout: adev:generated must be defined before adev:human");
  });

  // Acceptance criterion #8: human-marker-without-generated-marker → skip with warning
  it("SKILL.md instructs skip-with-warning when human marker present without generated marker", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("human-owned") || content.includes("human owned") ||
      (content.includes("adev:human") && content.includes("skip") && content.includes("warning")),
      "Must instruct Claude to skip files that have adev:human but no adev:generated, with a warning"
    );
    assert.ok(
      content.includes("do NOT overwrite") || content.includes("refuse to overwrite") || content.includes("Refusing to overwrite"),
      "Must explicitly say the file will NOT be overwritten"
    );
  });

  // Acceptance criterion #9: --check shows diff without writing
  it("SKILL.md defines --check as diff-without-write", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--check"), "Must define --check flag");
    assert.ok(
      content.includes("without writing") || content.includes("do not write") || content.includes("dry-run"),
      "--check must be described as not writing to disk"
    );
  });

  // Acceptance criterion #10: errors when repomap data or manifest missing
  it("SKILL.md defines error messages for all missing preconditions", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("Run /adev-repomap first"),
      "Must include exact error message for missing dependency-graph.json"
    );
    assert.ok(
      content.includes("Run /adev-repomap first") && content.includes("symbol index"),
      "Must include error message for missing symbol-ranks.json"
    );
    assert.ok(
      content.includes("Run /adev-init first"),
      "Must include exact error message for missing manifest.yaml"
    );
  });
});
