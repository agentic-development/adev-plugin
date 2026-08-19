import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT, readSkillSurface } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "brainstorm", "SKILL.md");
const skill = readSkillSurface("brainstorm");

describe("adev:brainstorm SKILL.md — workspace-mode bootstrap (Step 5b-3a)", () => {
  it("Step 5b references workspace-mode branching with detectWorkspace", () => {
    assert.ok(
      /workspace mode/i.test(skill),
      "Must reference workspace mode"
    );
    assert.ok(
      skill.includes("detectWorkspace"),
      "Must reference detectWorkspace for mode branching"
    );
  });

  it("Workspace-mode project name falls back to workspace root directory basename", () => {
    assert.ok(
      /workspace\.name/.test(skill),
      "Must reference workspace.name from adev-workspace.yaml"
    );
    assert.ok(
      /workspace root.*(?:basename|dirname|directory name)/i.test(skill),
      "Must describe fallback to workspace root basename/dirname/directory name"
    );
  });

  it("Vision prompt augments with per-repo identity listing coordinates repos", () => {
    assert.ok(
      skill.includes("coordinates <N> repos"),
      "Must include 'coordinates <N> repos' in workspace vision prompt"
    );
    assert.ok(
      /Identity/i.test(skill),
      "Must reference Identity section for per-repo identity"
    );
  });

  it("Identity extraction fallback rule is documented with ## Identity and 'no constitution' fallback (+3 more contract assertions)", () => {
    // Identity extraction fallback rule is documented with ## Identity and 'no constitution' fallback
    assert.ok(
    skill.includes("## Identity"),
    "Must document ## Identity section as primary extraction source"
    );
    assert.ok(
    skill.includes("no constitution"),
    "Must document 'no constitution' as final fallback string"
    );

    // Identity one-liners are sanitised via sanitizeIdentityOneLiner
    assert.ok(
    /sanitizeIdentityOneLiner|strip.*control char|ANSI/i.test(skill),
    "Must reference sanitizeIdentityOneLiner or describe control-char/ANSI stripping"
    );

    // Module Map in workspace mode contains workspace-charter rows only
    assert.ok(
    /workspace.charter.*only|workspace-charter rows only|workspace charters only/i.test(skill),
    "Must document that workspace-mode Module Map contains workspace charters only"
    );

    // Documents supersession of single-question contract from brainstorm-product-bootstrap B3
    assert.ok(
    /supersed/i.test(skill),
    "Must use 'supersedes' or related form"
    );
    assert.ok(
    /single.question/i.test(skill),
    "Must reference single-question contract"
    );
  });
});

describe("adev:brainstorm SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("brainstorm SKILL.md: repo-mode-inside-workspace advisory emits to stdout once", () => {
    assert.match(skill, /Advisory: running repo-scoped inside workspace/);
    assert.match(skill, /stdout/i);
    assert.match(skill, /once per invocation/i);
  });
});
