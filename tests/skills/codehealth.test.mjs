import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "codehealth", "SKILL.md");
const HYGIENE_PATH = join(PLUGIN_ROOT, "skills", "hygiene", "SKILL.md");
const MANIFEST_PATH = join(PLUGIN_ROOT, ".context-index", "manifest.yaml");

describe("adev:codehealth skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/codehealth/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev:codehealth"), "Must have name field");
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
      "UNKNOWN_CHECK",
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

  it("should document --module and --check arguments", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--module"), "Must document --module argument");
    assert.ok(content.includes("--check"), "Must document --check argument");
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
    const content = readSkillSurface("hygiene");
    assert.ok(
      content.includes("Code Health"),
      "Hygiene SKILL.md must include Code Health pass"
    );
  });

  it("should include code-health in --check options", () => {
    const content = readSkillSurface("hygiene");
    assert.ok(
      content.includes("code-health"),
      "Hygiene SKILL.md must list code-health in --check options"
    );
  });
});

describe("manifest registration", () => {
  it("should include adev:codehealth in maintenance module", () => {
    const manifest = readFileSync(MANIFEST_PATH, "utf8");
    assert.ok(
      manifest.includes("skills/codehealth/"),
      "Manifest must include skills/codehealth/ in maintenance module"
    );
  });
});

// ─── issue-u1jtc0: index.* is not a blanket orphan-detection exemption ────
//
// `lib/repomap/index.mjs` had zero real callers (only tests invoke it, as a
// subprocess — invisible to the import graph) but read as alive because
// Pass 2 unconditionally exempted every `**/index.*` file from orphan
// detection. An entry point with no caller IS the bug the pass exists to
// catch, not a reason to exempt it.
describe("adev:codehealth Pass 2 — index.* is verified, not blanket-exempted", () => {
  it("does not unconditionally exclude **/index.* from orphan detection", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.doesNotMatch(
      content,
      /Files matching `\*\*\/index\.\*` \(barrel files \/ entry points\)/,
      "index.* must not be a blanket exclusion bullet"
    );
  });

  it("verifies index.* candidates against real consumers (CLI registry, package.json scripts) before exempting", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.match(content, /Do NOT blanket-exclude `\*\*\/index\.\*`/);
    assert.match(content, /cli\/index\.mjs/);
    assert.match(content, /package\.json.*scripts/s);
  });
});

// ─── issue-u1jtc0: hygiene Pass 13 gates on repomap staleness, not just existence ──
//
// Pass 13 previously SKIPped only when symbol-ranks.json/dependency-graph.json
// were absent — a stale-but-present pair (the exact case that would surface
// repomap being broken) was silently analyzed as current. Pass 5 already
// staleness-checks repo-map.md against HEAD; Pass 13 consumes the JSON
// siblings of that same repomap run but never checked their own `commit`
// field.
describe("hygiene Pass 13 — staleness gate on repomap artifacts", () => {
  it("Pass 13's prerequisite checks dependency-graph.json's commit field, not just file existence", () => {
    const content = readSkillSurface("hygiene");
    const start = content.indexOf("## Audit Pass 13: Code Health");
    const end = content.indexOf("## Audit Pass 14", start);
    assert.notEqual(start, -1);
    const section = content.slice(start, end === -1 ? undefined : end);
    assert.match(section, /commit/, "must check the artifacts' commit marker");
    assert.match(section, /50 commits/, "must apply the same 50-commit threshold Pass 5 uses");
  });
});
