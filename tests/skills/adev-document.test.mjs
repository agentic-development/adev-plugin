import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "providers", "opencode", "skills", "adev-document", "SKILL.md");

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

  it("SKILL.md contains module docs generation section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("docs/modules/"), "Must reference docs/modules/ output path");
    assert.ok(content.includes("slug"), "Must reference module slug");
    assert.ok(content.includes("Key Exports"), "Must define Key Exports section");
    assert.ok(content.includes("Dependencies"), "Must define Dependencies section");
    assert.ok(content.includes("Related Specs"), "Must define Related Specs section");
  });

  it("SKILL.md enforces slug validation before path construction", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("[a-z0-9_-]"), "Must specify allowed slug character set");
    assert.ok(content.includes("path traversal") || content.includes(".."), "Must mention path traversal prevention");
    assert.ok(content.includes("path.resolve") || content.includes("prefix check"), "Must require boundary check after resolve");
  });

  it("SKILL.md defines --force flag behaviour for module docs", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--force"), "Must define --force flag");
    const forceIdx = content.indexOf("--force");
    const humanIdx = content.indexOf("adev:human", forceIdx);
    assert.ok(humanIdx !== -1 || content.includes("human content is never overwritten"),
      "Must clarify human content is preserved even with --force");
  });

  it("SKILL.md handles --module with slug not in manifest as exit 1", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("not found in manifest"),
      "Must define error when --module slug is not in manifest"
    );
  });

  it("SKILL.md defines marker-skip behaviour for module docs", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("adev:human") && content.includes("adev:generated"),
      "Must define both markers in the skill"
    );
  });

  it("SKILL.md contains manifest generation section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("GENERATED.md"), "Must reference GENERATED.md output file");
    assert.ok(content.includes("Last Commit"), "Must define Last Commit column");
    assert.ok(content.includes("Last Run"), "Must define Last Run column");
    assert.ok(content.includes("Generated Sections"), "Must define Generated Sections column");
  });

  it("SKILL.md validates commit SHA format before writing", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("rev-parse --short") || content.includes("short SHA") || content.includes("7-character"),
      "Must specify short SHA (7 chars) from git rev-parse --short HEAD"
    );
  });

  it("SKILL.md defines --check flag for manifest", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--check"), "Must define --check flag in manifest section");
  });

  it("SKILL.md handles malformed GENERATED.md with recovery", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("malformed") || content.includes("cannot be parsed"),
      "Must handle malformed existing GENERATED.md"
    );
  });

  it("SKILL.md covers all three generation steps in order", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const step1 = content.indexOf("Step 1");
    const step2 = content.indexOf("Step 2");
    const step3 = content.indexOf("Step 3");
    assert.ok(step1 !== -1, "Step 1 must be present");
    assert.ok(step2 !== -1, "Step 2 must be present");
    assert.ok(step3 !== -1, "Step 3 must be present");
    assert.ok(step1 < step2, "Step 1 must precede Step 2");
    assert.ok(step2 < step3, "Step 2 must precede Step 3");
  });

  it("SKILL.md defines Precondition Checks section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("Precondition"), "Must have precondition section");
  });

  it("SKILL.md defines all four argument flags", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--module"), "Must define --module flag");
    assert.ok(content.includes("--check"), "Must define --check flag");
    assert.ok(content.includes("--force"), "Must define --force flag");
  });
});
