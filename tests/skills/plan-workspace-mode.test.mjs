import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "plan", "SKILL.md");
const RELEASE_MODE_PATH = join(PLUGIN_ROOT, "skills", "plan", "release-mode.md");
const MILESTONE_MODE_PATH = join(PLUGIN_ROOT, "skills", "plan", "milestone-mode.md");
const skill = readFileSync(SKILL_PATH, "utf8") + "\n" + readFileSync(RELEASE_MODE_PATH, "utf8") + "\n" + readFileSync(MILESTONE_MODE_PATH, "utf8");

// Scope assertions to companion file contents directly
const releaseModeSection = readFileSync(RELEASE_MODE_PATH, "utf8");
const milestoneModeSection = readFileSync(MILESTONE_MODE_PATH, "utf8");

describe("adev:plan SKILL.md — Release Mode workspace-mode branching", () => {
  it("Release Mode branches on workspace detection", () => {
    assert.match(releaseModeSection, /detectWorkspace/,
      "Release Mode must reference detectWorkspace()");
    assert.match(releaseModeSection, /workspace mode/i,
      "Release Mode must mention workspace mode");
  });

  it("Release Mode reads workspace product.md via resolveWorkspaceProductPath", () => {
    assert.match(releaseModeSection, /resolveWorkspaceProductPath/,
      "Release Mode must reference resolveWorkspaceProductPath");
  });

  it("Release Mode feature list annotates source as workspace/<module> or <repo-slug>/<module>", () => {
    assert.match(releaseModeSection, /workspace\/<module>/,
      "Release Mode must annotate workspace-level features as workspace/<module>");
    assert.match(releaseModeSection, /<repo-slug>\/<module>/,
      "Release Mode must annotate per-repo features as <repo-slug>/<module>");
  });

  it("Release Mode documents non-transitive dependency inheritance rule", () => {
    assert.match(releaseModeSection, /inherit/i,
      "Release Mode must document inheritance of dependency edges");
    assert.match(releaseModeSection, /NOT transitive|non-transitive/i,
      "Release Mode must explicitly state the inheritance is NOT transitive");
  });

  it("Release Mode reads dependency graph via resolveWorkspaceContext", () => {
    assert.match(releaseModeSection, /resolveWorkspaceContext/,
      "Release Mode must reference resolveWorkspaceContext for dependency graph");
  });

  it("Release Mode unconditionally defers epic create() calls and references Shared Issue Tracking or Milestone 2", () => {
    assert.match(releaseModeSection, /skip.*create\(\)|unconditionally defer|unconditionally skip/i,
      "Release Mode must state that epic create() calls are unconditionally skipped/deferred");
    assert.match(releaseModeSection, /Shared Issue Tracking|Milestone 2/,
      "Release Mode must reference Shared Issue Tracking or Milestone 2 for deferred epic sync");
  });

  it("Release Mode applies path containment (assertPathInWorkspace) and size caps (readCappedText / MAX_CHARTER_FILES / MAX_CHARTER_FILE_BYTES)", () => {
    assert.match(releaseModeSection, /assertPathInWorkspace/,
      "Release Mode must reference assertPathInWorkspace for path containment");
    assert.match(releaseModeSection, /readCappedText|MAX_CHARTER_FILES|MAX_CHARTER_FILE_BYTES/,
      "Release Mode must reference readCappedText, MAX_CHARTER_FILES, or MAX_CHARTER_FILE_BYTES for size caps");
  });
});

describe("adev:plan SKILL.md — Milestone Mode", () => {
  it("Milestone Mode scans specs and filters by milestone", () => {
    const section = milestoneModeSection;
    assert.match(section, /scan all specs|filter by milestone/i);
  });

  it("Milestone Mode handles workspace dependency ordering", () => {
    const section = milestoneModeSection;
    assert.match(section, /workspace/i);
    assert.match(section, /topological/i);
  });

  it("Milestone Mode warns on non-reviewed specs", () => {
    const section = milestoneModeSection;
    assert.match(section, /warn.*non-reviewed|not yet review-passed/i);
  });
});

describe("adev:plan SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("repo-mode-inside-workspace advisory emits to stdout once", () => {
    assert.match(skill, /Advisory: running repo-scoped inside workspace/);
    assert.match(skill, /stdout/i);
    assert.match(skill, /once per invocation/i);
  });
});
