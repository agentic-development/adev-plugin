import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "specify", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

// === Task 1: Workspace-mode detection ===

describe("adev:specify SKILL.md — workspace-mode detection", () => {
  it("references detectWorkspace for workspace-mode branching", () => {
    assert.match(skill, /detectWorkspace/,
      "Must reference detectWorkspace()");
  });

  it("branches on currentRepoSlug === null for workspace root detection", () => {
    assert.match(skill, /currentRepoSlug.*null|null.*currentRepoSlug/i,
      "Must check currentRepoSlug === null for workspace root");
  });

  it("preserves single-repo behaviour when detectWorkspace returns null", () => {
    assert.match(skill, /detectWorkspace.*returns.*null|null.*no workspace/i,
      "Must state single-repo behaviour when no workspace detected");
  });

  it("documents that currentRepoSlug comes from detectWorkspace return value", () => {
    assert.match(skill, /detectWorkspace.*return|return.*currentRepoSlug/i,
      "Must clarify currentRepoSlug derivation (SA-1 review note)");
  });
});

// === Task 2: target-repo prompt and validation ===

describe("adev:specify SKILL.md — workspace-mode target-repo prompt", () => {
  it("prompts for target-repo in workspace mode", () => {
    assert.match(skill, /target-repo/,
      "Must reference target-repo frontmatter field");
  });

  it("lists registered repo slugs from adev-workspace.yaml", () => {
    assert.match(skill, /[Rr]egistered repos|repo slugs/,
      "Must list registered repos for target-repo selection");
  });

  it("accepts 'workspace' as a reserved target-repo token", () => {
    assert.match(skill, /["']workspace["'].*reserved|reserved.*["']workspace["']/i,
      "Must document 'workspace' as a reserved target-repo token");
  });

  it("validates target-repo slug with validateModuleName", () => {
    assert.match(skill, /validateModuleName/,
      "Must reference validateModuleName for slug validation");
  });

  it("rejects unknown repo slugs with re-prompt", () => {
    assert.match(skill, /[Uu]nknown repo slug|INVALID_TARGET_REPO/,
      "Must handle unknown repo slug rejection");
  });

  it("error codes are for human/agent reference only", () => {
    assert.match(skill, /human.*reference|agent.*reference|reference only/i,
      "Must clarify error codes are for reference only (SA-2 review note)");
  });
});

// === Task 3: Frontmatter, reference context, and isolation ===

describe("adev:specify SKILL.md — workspace-mode frontmatter and isolation", () => {
  it("adds target-repo to frontmatter in workspace mode", () => {
    assert.match(skill, /target-repo:.*<slug>/i,
      "Must show target-repo in frontmatter template");
  });

  it("writes specs to workspace .context-index/ in workspace mode", () => {
    assert.match(skill, /workspace.*\.context-index/i,
      "Must write specs to workspace .context-index/");
  });

  it("uses resolveWorkspaceContext for sibling repo reference context", () => {
    assert.match(skill, /resolveWorkspaceContext/,
      "Must reference resolveWorkspaceContext for sibling repo context");
  });

  it("enforces isolation: never writes to registered repo .context-index/", () => {
    assert.match(skill, /never writes to.*registered repo|isolation invariant|read-only/i,
      "Must enforce isolation invariant for sibling repos");
  });
});
