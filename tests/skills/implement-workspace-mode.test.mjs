import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "implement", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

describe("adev:implement SKILL.md — workspace detection in Step 1", () => {
  it("Step 1 calls detectWorkspace(cwd) to detect workspace mode (+1 more contract assertions)", () => {
    // Step 1 calls detectWorkspace(cwd) to detect workspace mode
    assert.match(skill, /detectWorkspace\(cwd\)/,
    "Step 1 must call detectWorkspace(cwd)");

    // Step 1 stores workspace state for later steps
    assert.match(skill, /workspace state/i,
    "Step 1 must mention storing workspace state");
  });

  it("fresh per task is defensive hygiene, not concurrency support", () => {
    // SA-2: Clarify "fresh per task" is defensive hygiene
    assert.match(skill, /defensive hygiene/i,
      "Must clarify that fresh-per-task workspace detection is defensive hygiene, not concurrency support");
  });
});

describe("adev:implement SKILL.md — repo-mode-inside-workspace advisory", () => {
  it("emits advisory to stdout once per invocation (+2 more contract assertions)", () => {
    // emits advisory to stdout once per invocation
    assert.match(skill, /Advisory: running repo-scoped inside workspace/,
    "Must include the repo-mode-inside-workspace advisory text");
    assert.match(skill, /stdout/i,
    "Advisory must specify stdout as the output channel");
    assert.match(skill, /once per invocation/i,
    "Advisory must fire exactly once per invocation");

    // advisory does not block execution
    assert.match(skill, /advisory does not block/i,
    "Must state the advisory does not block");

    // advisory does not appear when detectWorkspace returns null
    assert.match(skill, /detectWorkspace.*returns?\s+null/i,
    "Must state advisory is suppressed when detectWorkspace returns null");
  });
});

describe("adev:implement SKILL.md — cross-repo reference resolution in Step 2a", () => {
  it("parses depends-on for @repo-slug/spec-slug entries", () => {
    assert.match(skill, /depends-on/,
      "Step 2a must reference depends-on frontmatter");
    assert.match(skill, /@repo-slug\/spec-slug/,
      "Step 2a must reference @repo-slug/spec-slug format");
  });

  it("resolves references via resolveRef(workspaceRoot, config, ref)", () => {
    assert.match(skill, /resolveRef/,
      "Step 2a must call resolveRef for cross-repo resolution");
  });

  it("resolveRef only searches specs/features/", () => {
    // SA-3: Note that resolveRef only searches specs/features/
    assert.match(skill, /specs\/features\//,
      "Must note that resolveRef only searches specs/features/");
  });

  it("appends resolved content under ## Cross-Repo Reference Context (+1 more contract assertions)", () => {
    // appends resolved content under ## Cross-Repo Reference Context
    assert.match(skill, /## Cross-Repo Reference Context/,
    "Step 2a must append resolved content under ## Cross-Repo Reference Context heading");

    // handles resolution failures with non-blocking warnings
    assert.match(skill, /non-blocking/i,
    "Cross-repo resolution failures must be non-blocking");
    assert.match(skill, /warning/i,
    "Cross-repo resolution failures must emit warnings");
  });
});

describe("adev:implement SKILL.md — subagent prompt workspace additions in Step 2c", () => {
  it("scene-setting context includes target-repo: informational advisory (+1 more contract assertions)", () => {
    // scene-setting context includes target-repo: informational advisory
    assert.match(skill, /target-repo:/,
    "Step 2c scene-setting must include target-repo: advisory");

    // scope discipline includes cross-repo isolation constraint
    assert.match(skill, /cross-repo isolation/i,
    "Step 2c scope discipline must include cross-repo isolation constraint");
  });
});
