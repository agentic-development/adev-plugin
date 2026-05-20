import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "brainstorm", "SKILL.md");

/**
 * Step 8 of `skills/brainstorm/SKILL.md` enriches the transition-to-spec
 * handoff with a deterministic "Spec Organization Plan" — capability grouping
 * table, optional ASCII dependency graph, three named heuristics, and edge-case
 * routing. This suite asserts that contract by reading the SKILL.md file
 * directly (mirrors the pattern in `brainstorm-kind-routing.test.mjs`).
 *
 * Spec: .context-index/specs/features/design/brainstorm-spec-grouping.spec.md
 */
describe("adev:brainstorm SKILL.md — Step 8 Spec Organization Plan", () => {
  let content;
  let step8Block;

  before(() => {
    assert.ok(existsSync(SKILL_PATH), "skills/brainstorm/SKILL.md must exist");
    content = readFileSync(SKILL_PATH, "utf8");
    const start = content.indexOf("## Step 8: Transition to Specification");
    assert.ok(start !== -1, "Step 8 heading must exist");
    // Step 8 is currently the final ## section before Key Principles
    const end = content.indexOf("## Key Principles", start);
    step8Block = content.slice(start, end === -1 ? content.length : end);
  });

  it("Step 8 heading exists in SKILL.md", () => {
    assert.ok(
      content.includes("## Step 8: Transition to Specification"),
      "Step 8 heading must be present"
    );
  });

  it("Step 8 renders the Spec Organization Plan section", () => {
    assert.ok(
      step8Block.includes("Spec Organization Plan"),
      "Step 8 must include the 'Spec Organization Plan' heading or label"
    );
  });

  it("Step 8 defines all three named heuristics inline with their gloss", () => {
    // Each heuristic name must appear AND be co-located with its defining
    // phrase so the rendering is reproducible across model runs (spec
    // §Output Contract item 3).
    for (const name of ["cohesion", "dependency-chain", "blast-radius"]) {
      assert.ok(
        step8Block.includes(name),
        `Step 8 must mention heuristic name '${name}'`
      );
    }
    assert.ok(
      step8Block.includes("invariant"),
      "Step 8 cohesion definition must reference 'invariant'"
    );
    assert.ok(
      step8Block.includes("consumes"),
      "Step 8 dependency-chain definition must reference 'consumes'"
    );
    assert.ok(
      /module\/file cluster/.test(step8Block),
      "Step 8 blast-radius definition must reference 'module/file cluster'"
    );
  });

  it("Step 8 includes the capability grouping table shape", () => {
    assert.ok(
      step8Block.includes("| Spec | Capabilities | Rationale |"),
      "Step 8 must contain the grouping table header row"
    );
  });

  it("Step 8 documents the ASCII dependency-graph cue with conditional wording", () => {
    // The spec's example diagram uses `─→` (U+2500 + U+2192). When ≥2 specs
    // have ordering dependencies the diagram is rendered; otherwise omitted.
    assert.ok(
      step8Block.includes("─→") || step8Block.includes("ASCII"),
      "Step 8 must reference an ASCII dependency diagram"
    );
    assert.ok(
      /ordering dependenc/i.test(step8Block),
      "Step 8 must describe the 'ordering dependencies' condition for rendering the graph"
    );
  });

  it("Step 8 documents all five failure-mode rows", () => {
    // The five edge cases from the spec's Failure Modes table.
    for (const substr of [
      "0 must-have",
      "exactly 1",
      ">12",
      "ambiguous",
      "override",
    ]) {
      assert.ok(
        step8Block.includes(substr),
        `Step 8 must document failure-mode substring '${substr}'`
      );
    }
  });

  it("Step 8 encodes the heuristic-conflict rule verbatim", () => {
    assert.ok(
      step8Block.includes(
        "cohesion suggests together, blast-radius suggests apart"
      ),
      "Step 8 must include the verbatim heuristic-conflict note from the spec"
    );
  });

  it("Step 8 documents override stickiness across session turns", () => {
    assert.ok(
      step8Block.includes("do not re-render the grouping table on subsequent turns"),
      "Step 8 must document override stickiness (no re-rendering after user overrides)"
    );
  });

  it("Step 8 preserves the /adev:specify terminal-state line verbatim", () => {
    assert.ok(
      step8Block.includes("The terminal state is invoking `/adev:specify`"),
      "Step 8 must retain the verbatim terminal-state line for /adev:specify"
    );
  });

  it("Step 8 declares that no new files are written by this step", () => {
    assert.ok(
      step8Block.includes("No new files"),
      "Step 8 must declare that no new files are written (spec §Output Contract item 5)"
    );
  });
});

/**
 * Cursor-provider regression fixture — frozen reference scenario.
 *
 * The spec lists the cursor-provider charter's 5-spec grouping
 * (manifest+parity, adapter+sanitization, hook-generator+tests, CLI-integration,
 * sync-target) drawn from its 12 capabilities as a regression case. The
 * heuristic engine itself is the markdown prompt in Step 8; this fixture
 * verifies the SHAPE of the expected outcome (12 caps total, 5 groups, each
 * group cites exactly one of the three heuristic names).
 *
 * TODO(plan-task-implement): when a JS extractor is added that runs the
 * heuristics over a charter file, re-run this fixture through that extractor
 * and assert the produced grouping equals CURSOR_PROVIDER_EXPECTED_GROUPS.
 */
describe("adev:brainstorm Step 8 — cursor-provider regression fixture", () => {
  const CURSOR_PROVIDER_CAPABILITIES = Object.freeze([
    "manifest",
    "parity",
    "adapter",
    "sanitization",
    "hook-generator",
    "hook-tests",
    "cli-integration-install",
    "cli-integration-update",
    "cli-integration-remove",
    "sync-target",
    "sync-source",
    "sync-conflict-resolution",
  ]);

  const CURSOR_PROVIDER_EXPECTED_GROUPS = Object.freeze([
    Object.freeze({
      spec: "manifest-parity",
      capabilities: Object.freeze(["manifest", "parity"]),
      heuristic: "cohesion",
    }),
    Object.freeze({
      spec: "adapter-sanitization",
      capabilities: Object.freeze(["adapter", "sanitization"]),
      heuristic: "cohesion",
    }),
    Object.freeze({
      spec: "hook-generator-tests",
      capabilities: Object.freeze(["hook-generator", "hook-tests"]),
      heuristic: "dependency-chain",
    }),
    Object.freeze({
      spec: "cli-integration",
      capabilities: Object.freeze([
        "cli-integration-install",
        "cli-integration-update",
        "cli-integration-remove",
      ]),
      heuristic: "blast-radius",
    }),
    Object.freeze({
      spec: "sync-target",
      capabilities: Object.freeze([
        "sync-target",
        "sync-source",
        "sync-conflict-resolution",
      ]),
      heuristic: "blast-radius",
    }),
  ]);

  const VALID_HEURISTICS = new Set([
    "cohesion",
    "dependency-chain",
    "blast-radius",
  ]);

  it("fixture covers all 12 cursor-provider capabilities exactly once", () => {
    const flattened = CURSOR_PROVIDER_EXPECTED_GROUPS.flatMap(
      (g) => g.capabilities
    );
    assert.equal(
      flattened.length,
      CURSOR_PROVIDER_CAPABILITIES.length,
      "Grouped capabilities must equal total capability count"
    );
    assert.deepEqual(
      [...flattened].sort(),
      [...CURSOR_PROVIDER_CAPABILITIES].sort(),
      "Grouped capabilities must equal the cursor-provider capability set"
    );
    assert.equal(
      new Set(flattened).size,
      flattened.length,
      "No capability appears in more than one group"
    );
  });

  it("fixture produces exactly 5 spec groups (matches spec)", () => {
    assert.equal(
      CURSOR_PROVIDER_EXPECTED_GROUPS.length,
      5,
      "cursor-provider grouping must produce 5 specs"
    );
  });

  it("each fixture group cites exactly one of the three named heuristics", () => {
    for (const group of CURSOR_PROVIDER_EXPECTED_GROUPS) {
      assert.ok(
        VALID_HEURISTICS.has(group.heuristic),
        `Group '${group.spec}' cites unknown heuristic '${group.heuristic}'`
      );
    }
  });
});
