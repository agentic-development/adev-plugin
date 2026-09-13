import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "validate", "SKILL.md");
const skill = readSkillSurface("validate");

describe("adev:validate SKILL.md — workspace-aware cross-repo validation", () => {
  it("references detectWorkspace for workspace detection gate", () => {
    assert.match(skill, /detectWorkspace/,
      "Must reference detectWorkspace() for workspace detection");
  });

  it("references resolveRef for cross-repo reference resolution", () => {
    assert.match(skill, /resolveRef/,
      "Must reference resolveRef() for resolving cross-repo depends-on references");
  });

  it("describes cross-repo depends-on pattern @repo-slug/spec-slug (+1 more contract assertions)", () => {
    // describes cross-repo depends-on pattern @repo-slug/spec-slug
    assert.match(skill, /@.*repo-slug.*\/.*spec-slug|@<repo-slug>\/<spec-slug>/,
    "Must describe the @repo-slug/spec-slug cross-repo reference pattern");

    // workspace-aware validation mode is entered only when cross-repo refs exist
    assert.match(skill, /workspace-aware validation mode/i,
    "Must name the workspace-aware validation mode");
    assert.match(skill, /depends-on/,
    "Must reference depends-on frontmatter field");
  });

  it("unresolvable cross-repo references produce warnings not errors", () => {
    assert.match(skill, /warning/i,
      "Must mention warning for unresolvable references");
    assert.match(skill, /not.*block|non-blocking|warning.*not.*error/i,
      "Must state unresolvable references are non-blocking");
  });

  it("Check 2 (Spec Compliance) gains cross-repo interface verification (+4 more contract assertions)", () => {
    // Check 2 (Spec Compliance) gains cross-repo interface verification
    assert.match(skill, /cross-repo.*interface|interface.*contract.*cross-repo|cross-repo.*dependenc/i,
    "Check 2 must reference cross-repo interface verification");

    // Check 3 (Charter Consistency) includes cross-repo dependency context
    assert.match(skill, /cross-repo.*scope|cross-repo.*charter|dependency.*context/i,
    "Check 3 must include cross-repo dependency context");

    // sibling repo content is read-only
    assert.match(skill, /read-only|read.only/i,
    "Must state sibling repo content is read-only reference");

    // includes a cross-repo validation report section
    assert.match(skill, /Cross-Repo Dependency Validation/,
    "Must include a Cross-Repo Dependency Validation report section");

    // single-repo backward compatibility is preserved
    assert.match(skill, /detectWorkspace.*null|null.*detectWorkspace|no workspace/i,
    "Must describe single-repo fallback when detectWorkspace returns null");
  });

  it("applies assertPathInWorkspace for input hardening", () => {
    assert.match(skill, /assertPathInWorkspace/,
      "Must reference assertPathInWorkspace for path containment");
  });

  it("applies readCappedText or file-size cap for sibling spec reads", () => {
    assert.match(skill, /readCappedText|512\s*KB|MAX_.*BYTES/,
      "Must reference readCappedText or 512 KB cap for sibling spec file reads");
  });


});

describe("adev:validate SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("emits advisory when repo-scoped inside workspace with no cross-repo refs", () => {
    assert.match(skill, /Advisory: running repo-scoped inside workspace/,
      "Must include the repo-mode-inside-workspace advisory text");
    assert.match(skill, /once per invocation/i,
      "Advisory must be emitted once per invocation");
  });
});
