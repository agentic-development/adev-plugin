import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "status", "SKILL.md");
const skill = readSkillSurface("status");

// Scope workspace assertions to the Workspace Aggregation section
const workspaceSection = skill.slice(
  skill.indexOf("### Mode: Workspace Aggregation"),
);

describe("adev:status SKILL.md — workspace-mode detection", () => {
  it("references detectWorkspace for workspace mode (+1 more contract assertions)", () => {
    // references detectWorkspace for workspace mode
    assert.match(workspaceSection, /detectWorkspace/,
    "Workspace Aggregation must reference detectWorkspace()");

    // mentions workspace mode branching
    assert.match(workspaceSection, /workspace mode/i,
    "Workspace Aggregation must mention workspace mode");
  });
});

describe("adev:status SKILL.md — cross-repo status aggregation", () => {
  it("aggregates status across repos via resolveWorkspaceContext", () => {
    assert.match(workspaceSection, /resolveWorkspaceContext/,
      "Workspace Aggregation must reference resolveWorkspaceContext for cross-repo aggregation");
  });

  it("aggregates charter and spec status across registered repos", () => {
    assert.match(workspaceSection, /aggregat/i,
      "Workspace Aggregation must aggregate across repos");
    assert.match(workspaceSection, /registered repo/i,
      "Workspace Aggregation must reference registered repos");
  });
});

describe("adev:status SKILL.md — charter-revision staleness tracking", () => {
  it("tracks charter-revision staleness across workspace (+1 more contract assertions)", () => {
    // tracks charter-revision staleness across workspace
    assert.match(workspaceSection, /charter-revision/,
    "Workspace Aggregation must reference charter-revision");
    assert.match(workspaceSection, /stale/i,
    "Workspace Aggregation must flag stale charter-revision values");

    // compares workspace charter revision against repo-level specs
    assert.match(workspaceSection, /workspace.*charter.*revision|charter.*revision.*workspace/i,
    "Workspace Aggregation must compare workspace charter revision against repo specs");
  });
});

describe("adev:status SKILL.md — single-repo behaviour preserved", () => {
  it("preserves single-repo mode when not at workspace root", () => {
    assert.match(skill, /single-repo|existing single-repo/i,
      "Must preserve single-repo behaviour");
  });
});

describe("adev:status SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("emits advisory when running repo-scoped inside workspace (+1 more contract assertions)", () => {
    // emits advisory when running repo-scoped inside workspace
    assert.match(skill, /Advisory: running repo-scoped inside workspace/,
    "Must emit repo-mode-inside-workspace advisory");

    // advisory is emitted to stdout once per invocation
    assert.match(skill, /stdout/i,
    "Advisory must mention stdout");
    assert.match(skill, /once per invocation/i,
    "Advisory must be emitted once per invocation");
  });
});
