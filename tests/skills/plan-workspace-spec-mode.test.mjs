import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "plan", "SKILL.md");
const skill = readFileSync(SKILL_PATH, "utf8");

// Extract the Spec Mode section (from "## Spec Mode" up to "## Feature Mode")
const specModeSection = skill.slice(
  skill.indexOf("## Spec Mode"),
  skill.indexOf("## Feature Mode"),
);

describe("adev:plan SKILL.md — Spec Mode workspace-aware target-repo detection", () => {
  it("detects target-repo from spec YAML frontmatter", () => {
    assert.match(specModeSection, /target-repo/,
      "Spec Mode must reference target-repo frontmatter field");
    assert.match(specModeSection, /frontmatter/i,
      "Spec Mode must mention parsing frontmatter for target-repo");
  });

  it("enters workspace-aware Spec Mode when target-repo present and workspace detected", () => {
    assert.match(specModeSection, /workspace-aware Spec Mode/i,
      "Spec Mode must name the workspace-aware Spec Mode branch");
    assert.match(specModeSection, /detectWorkspace/,
      "Spec Mode must reference detectWorkspace() for workspace detection");
  });

  it("warns when target-repo present but no workspace detected (NO_WORKSPACE fallback)", () => {
    assert.match(specModeSection, /no workspace|NO_WORKSPACE/i,
      "Spec Mode must handle the case where target-repo is set but no workspace exists");
    assert.match(specModeSection, /warn|warning|single-repo flow/i,
      "Spec Mode must warn and fall back to single-repo flow when no workspace");
  });

  it("validates target-repo against workspace registry via validateModuleName()", () => {
    assert.match(specModeSection, /validateModuleName/,
      "Spec Mode must reference validateModuleName() for target-repo validation");
  });
});

describe("adev:plan SKILL.md — Spec Mode workspace-aware context loading", () => {
  it("loads target repo constitution, platform-context, and orientation (+2 more contract assertions)", () => {
    // loads target repo constitution, platform-context, and orientation
    assert.match(specModeSection, /target repo.*constitution|constitution.*target repo/i,
    "Spec Mode must load target repo's constitution");
    assert.match(specModeSection, /platform-context/i,
    "Spec Mode must load target repo's platform-context");
    assert.match(specModeSection, /orientation/i,
    "Spec Mode must load target repo's orientation");

    // handles missing .context-index/ gracefully
    assert.match(specModeSection, /missing.*\.context-index|\.context-index.*missing|gracefully/i,
    "Spec Mode must handle missing .context-index/ in target repo");

    // handles target-repo: workspace (no repo constitution)
    assert.match(specModeSection, /target-repo:\s*workspace|target-repo.*workspace/i,
    "Spec Mode must handle target-repo: workspace as a special value");
  });
});

describe("adev:plan SKILL.md — Spec Mode cross-repo depends-on resolution", () => {
  it("parses depends-on for @repo-slug/spec-slug entries", () => {
    assert.match(specModeSection, /@repo-slug\/spec-slug|@[\w-]+\/[\w-]+/,
      "Spec Mode must document @repo-slug/spec-slug depends-on format");
  });

  it("resolves cross-repo refs via resolveRef()", () => {
    assert.match(specModeSection, /resolveRef/,
      "Spec Mode must reference resolveRef() for cross-repo dependency resolution");
  });

  it("includes resolved cross-repo deps in Context Packets (+1 more contract assertions)", () => {
    // includes resolved cross-repo deps in Context Packets
    assert.match(specModeSection, /Context Packet/i,
    "Spec Mode must include resolved cross-repo deps in Context Packets");

    // warns on unresolvable refs
    assert.match(specModeSection, /unresolvable|cannot resolve|warn.*ref/i,
    "Spec Mode must warn on unresolvable cross-repo refs");
  });
});

describe("adev:plan SKILL.md — Spec Mode repo-relative file paths", () => {
  it("prefixes file paths with repo path when target-repo is a repo slug", () => {
    assert.match(specModeSection, /prefix.*file.*path.*repo|repo.*path.*prefix|repo-relative/i,
      "Spec Mode must prefix file paths with repo path for repo-slug target");
  });

  it("uses workspace-relative paths when target-repo is workspace (+1 more contract assertions)", () => {
    // uses workspace-relative paths when target-repo is workspace
    assert.match(specModeSection, /workspace-relative/i,
    "Spec Mode must use workspace-relative paths when target-repo is workspace");

    // includes target repo slug in commit scope
    assert.match(specModeSection, /commit.*scope.*target.*repo|target.*repo.*slug.*commit/i,
    "Spec Mode must include target repo slug in commit scope");
  });
});

describe("adev:plan SKILL.md — Spec Mode plan save location", () => {
  it("saves plan in workspace .context-index/, not target repo", () => {
    assert.match(specModeSection, /workspace.*\.context-index|plan.*saved.*workspace/i,
      "Spec Mode plan must be saved in workspace .context-index/, not target repo");
  });
});

describe("adev:plan SKILL.md — Spec Mode workspace commit convention (SA-3)", () => {
  it("documents commit/branch convention for target-repo: workspace", () => {
    assert.match(specModeSection, /workspace.*name|branch.*workspace/i,
      "Spec Mode must document branch convention for target-repo: workspace (use workspace name)");
  });
});

describe("adev:plan SKILL.md — Spec Mode NO_WORKSPACE fallback rationale (SA-5)", () => {
  it("documents rationale for NO_WORKSPACE fallback", () => {
    assert.match(specModeSection, /fallback.*rationale|rationale.*fallback|single-repo.*fallback/i,
      "Spec Mode must document the NO_WORKSPACE fallback rationale");
  });
});
