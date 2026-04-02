import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "adev-codehealth", "SKILL.md");
const HYGIENE_PATH = join(PLUGIN_ROOT, "skills", "adev-hygiene", "SKILL.md");
const MANIFEST_PATH = join(PLUGIN_ROOT, ".context-index", "manifest.yaml");

describe("adev-codehealth skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/adev-codehealth/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev-codehealth"), "Must have name field");
    assert.ok(content.includes("description:"), "Must have description field");
  });

  it("should define all 5 detection passes", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const passes = [
      "Dead Export Detection",
      "Orphan File Detection",
      "Unused Dependency Detection",
      "Stale Code Detection",
      "Duplicate Logic Detection",
    ];
    for (const pass of passes) {
      assert.ok(content.includes(pass), `Missing pass: ${pass}`);
    }
  });

  it("should document all valid pass names", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const passNames = [
      "dead-exports",
      "orphan-files",
      "unused-deps",
      "stale-code",
      "duplicate-logic",
    ];
    for (const name of passNames) {
      assert.ok(content.includes(name), `Missing pass name: ${name}`);
    }
  });

  it("should document all error codes", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const allCodes = [
      "MISSING_REPOMAP",
      "INVALID_MANIFEST",
      "UNKNOWN_MODULE",
      "UNKNOWN_PASS",
      "FORMAT_ERROR",
      "MISSING_PACKAGE_JSON",
      "GIT_UNAVAILABLE",
      "TREESITTER_UNAVAILABLE",
      "WRITE_ERROR",
      "MALFORMED_FINDING",
    ];
    for (const code of allCodes) {
      assert.ok(content.includes(code), `Missing error code: ${code}`);
    }
  });

  it("should document severity levels", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("high"), "Must document high severity");
    assert.ok(content.includes("medium"), "Must document medium severity");
    assert.ok(content.includes("low"), "Must document low severity");
  });

  it("should reference repomap artifact paths", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("symbol-ranks.json"),
      "Must reference symbol-ranks.json"
    );
    assert.ok(
      content.includes("dependency-graph.json"),
      "Must reference dependency-graph.json"
    );
  });

  it("should document coverage_exclude filtering", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("coverage_exclude"),
      "Must document coverage_exclude"
    );
  });

  it("should document tree-sitter degradation for duplicate-logic", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("tree-sitter"),
      "Must mention tree-sitter"
    );
    assert.ok(
      content.includes("ADR-0001") || content.includes("optional"),
      "Must reference ADR-0001 or note tree-sitter as optional"
    );
  });

  it("should define report output format with frontmatter schema", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("codehealth-"), "Must define report filename pattern");
    assert.ok(
      content.includes(".context-index/reports/"),
      "Must specify report directory"
    );
    assert.ok(
      content.includes("total_findings"),
      "Must define total_findings in frontmatter"
    );
  });

  it("should document --module and --pass arguments", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--module"), "Must document --module argument");
    assert.ok(content.includes("--pass"), "Must document --pass argument");
  });

  it("should document file scope resolution order", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("source_roots"),
      "Must reference source_roots in scope resolution"
    );
  });
});

describe("hygiene integration", () => {
  it("should include Code Health pass in hygiene SKILL.md", () => {
    const content = readFileSync(HYGIENE_PATH, "utf8");
    assert.ok(
      content.includes("Code Health"),
      "Hygiene SKILL.md must include Code Health pass"
    );
  });

  it("should include code-health in --check options", () => {
    const content = readFileSync(HYGIENE_PATH, "utf8");
    assert.ok(
      content.includes("code-health"),
      "Hygiene SKILL.md must list code-health in --check options"
    );
  });
});

describe("manifest registration", () => {
  it("should include adev-codehealth in maintenance module", () => {
    const manifest = readFileSync(MANIFEST_PATH, "utf8");
    assert.ok(
      manifest.includes("skills/adev-codehealth/"),
      "Manifest must include skills/adev-codehealth/ in maintenance module"
    );
  });
});
