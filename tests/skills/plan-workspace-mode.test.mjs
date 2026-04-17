import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "plan", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

// Scope all assertions to the Release Mode section
const releaseModeSection = skill.slice(skill.indexOf("## Release Mode"));

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

  it("Release Mode unconditionally defers epic create() calls and references Shared Issue Tracking or Phase 2", () => {
    assert.match(releaseModeSection, /skip.*create\(\)|unconditionally defer|unconditionally skip/i,
      "Release Mode must state that epic create() calls are unconditionally skipped/deferred");
    assert.match(releaseModeSection, /Shared Issue Tracking|Phase 2/,
      "Release Mode must reference Shared Issue Tracking or Phase 2 for deferred epic sync");
  });

  it("Release Mode applies path containment (assertPathInWorkspace) and size caps (readCappedText / MAX_CHARTER_FILES / MAX_CHARTER_FILE_BYTES)", () => {
    assert.match(releaseModeSection, /assertPathInWorkspace/,
      "Release Mode must reference assertPathInWorkspace for path containment");
    assert.match(releaseModeSection, /readCappedText|MAX_CHARTER_FILES|MAX_CHARTER_FILE_BYTES/,
      "Release Mode must reference readCappedText, MAX_CHARTER_FILES, or MAX_CHARTER_FILE_BYTES for size caps");
  });
});

describe("adev:plan SKILL.md — Milestone Mode workspace-mode branching", () => {
  it("Milestone Mode branches on workspace detection", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /detectWorkspace/);
    assert.match(section, /workspace mode/i);
  });

  it("Milestone Mode reads workspace product.md", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /resolveWorkspaceProductPath/);
  });

  it("Milestone Mode validates module-name tokens", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /validateModuleName/);
    assert.match(section, /INVALID_MODULE_NAME/);
  });

  it("Milestone Mode prompts for ambiguous module names", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /disambiguat/i);
  });

  it("Milestone Mode unconditionally defers epic create() in workspace mode", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /skip.*create\(\)|unconditionally defer|unconditionally skip/i);
    assert.match(section, /Shared Issue Tracking|Phase 2/);
  });

  it("Milestone Mode never writes to registered repo product.md", () => {
    const section = skill.slice(
      skill.indexOf("## Milestone Mode"),
      skill.indexOf("## Epic Mode"),
    );
    assert.match(section, /never writes.*repo.*product\.md|isolation/i);
  });
});
