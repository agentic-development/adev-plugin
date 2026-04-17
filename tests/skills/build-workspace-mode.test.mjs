import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "build", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:build SKILL.md — workspace-mode build orchestration", () => {
  it("workspace-mode build branches on detectWorkspace + currentRepoSlug null + --phase", () => {
    assert.match(skill, /detectWorkspace/,
      "Must reference detectWorkspace()");
    assert.match(skill, /currentRepoSlug/,
      "Must reference currentRepoSlug for mode branching");
    assert.match(skill, /workspace.mode build|workspace-mode build/i,
      "Must describe workspace-mode build");
  });

  it("workspace-mode build reads dependency graph via resolveWorkspaceContext", () => {
    assert.match(skill, /resolveWorkspaceContext/,
      "Must reference resolveWorkspaceContext for dependency graph");
    assert.match(skill, /dependencyGraph/,
      "Must reference dependencyGraph from workspace context");
  });

  it("workspace-mode build sorts repos topologically (upstream first)", () => {
    assert.match(skill, /topologic/i,
      "Must reference topological sorting");
    assert.match(skill, /upstream.*first/i,
      "Must specify upstream repos are built first");
  });

  it("workspace-mode build delegates to /adev:plan --phase and /adev:implement per repo", () => {
    assert.match(skill, /\/adev:plan --phase/,
      "Must delegate to /adev:plan --phase per repo");
    assert.match(skill, /\/adev:implement/,
      "Must delegate to /adev:implement per repo");
  });

  it("circular dependencies fall back to declaration order with a warning", () => {
    assert.match(skill, /circular dep/i,
      "Must handle circular dependencies");
    assert.match(skill, /declaration order/i,
      "Must fall back to declaration order on cycles");
    assert.match(skill, /[Ww]arning.*circular/i,
      "Must emit a warning on circular dependencies");
  });

  it("failed upstream repos cause dependent downstream repos to be skipped", () => {
    assert.match(skill, /upstream.*fail|failed.*upstream/i,
      "Must handle upstream repo failures");
    assert.match(skill, /downstream.*skip|skip.*downstream|dependent.*skip/i,
      "Must skip dependent downstream repos on upstream failure");
  });

  it("cross-repo summary is printed after all repos are processed", () => {
    assert.match(skill, /repos attempted.*passed.*failed.*skipped/i,
      "Must print cross-repo summary with attempt/pass/fail/skip counts");
  });

  it("build progress reports across repos with current/total header", () => {
    assert.match(skill, /\[<current>\/<total>\]/,
      "Must print progress header with [current/total] format");
    assert.match(skill, /Building repo/,
      "Must print 'Building repo' progress header");
  });
});

describe("adev:build SKILL.md — workspace-mode dry run", () => {
  it("dry run in workspace mode shows cross-repo build plan with topological ordering", () => {
    assert.match(skill, /Dry Run.*Workspace Build/i,
      "Must show workspace-mode dry run header");
    assert.match(skill, /Repo order.*topological/i,
      "Must show repo order as topological in dry run");
  });
});

describe("adev:build SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("repo-mode-inside-workspace advisory emits to stdout once", () => {
    assert.match(skill, /Advisory: running repo-scoped inside workspace/,
      "Must include repo-mode-inside-workspace advisory text");
    assert.match(skill, /stdout/i,
      "Advisory must be emitted to stdout");
    assert.match(skill, /once per invocation/i,
      "Advisory must be emitted exactly once per invocation");
  });
});

describe("adev:build SKILL.md — single-repo preservation", () => {
  it("single-repo behaviour preserved when detectWorkspace returns null", () => {
    assert.match(skill, /single.repo.*preserv|preserv.*single.repo|unchanged.*single.repo/i,
      "Must explicitly preserve single-repo behaviour");
  });
});

describe("adev:build SKILL.md — input hardening", () => {
  it("path containment enforced via assertPathInWorkspace", () => {
    assert.match(skill, /assertPathInWorkspace/,
      "Must reference assertPathInWorkspace for path containment");
    assert.match(skill, /PATH_ESCAPE/,
      "Must handle PATH_ESCAPE with a warning/skip");
  });
});
