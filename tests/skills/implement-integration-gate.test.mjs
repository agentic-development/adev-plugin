import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("implement SKILL.md — unified integration gate", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "implement", "SKILL.md");
  const skill = readFileSync(skillPath, "utf8");

  // The Step 2-post body was extracted to a conditional-loading companion when
  // implement/SKILL.md crossed the 65,536-byte cap the Copilot provider enforces.
  // Resolve the companion FROM the pointer rather than hardcoding its path, so a
  // rename or a dropped pointer fails here instead of silently reading nothing.
  const pointer = skill.match(
    /### Step 2-post: Integration Gate\s*\n\s*\n> \*\*Conditional loading:\*\* Read `([^`]+)`/,
  );
  assert.ok(
    pointer,
    "Step 2-post must carry a `Conditional loading:` pointer to its companion",
  );
  const companionPath = join(__dirname, "..", "..", pointer[1]);
  const content = readFileSync(companionPath, "utf8");

  it("should read integration gates from governance/gates.yaml", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("governance/gates.yaml"),
      "Step 2-post should reference governance/gates.yaml for integration gates");
  });

  it("should NOT reference manifest for integration gate source", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(!step2post.includes("Read `manifest.yaml` `gates:`"),
      "Step 2-post should not read from manifest gates");
  });

  it("should skip when --task is passed", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("--task") && step2post.includes("skip"),
      "Should skip integration gate on single-task re-run");
  });

  it("should skip silently when no integration-tier gates defined", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(step2post.includes("skip") && step2post.includes("silently"),
      "Should skip silently when no integration gates");
  });

  it("should not have manifest-only restriction", () => {
    const step2post = content.substring(content.indexOf("Step 2-post"));
    assert.ok(!step2post.includes("reads from `manifest.yaml` only"),
      "Should not restrict to manifest-only");
  });

  it("should not have manifest fallback in Step 2h", () => {
    const step2h = content.substring(content.indexOf("2h."), content.indexOf("Step 2-post"));
    assert.ok(!step2h.includes("fall back to manifest quality gates"),
      "Step 2h should not fall back to manifest");
  });
});

describe("implement SKILL.md — Step 2-post merged gate source and severity", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "implement", "SKILL.md");
  const skill = readFileSync(skillPath, "utf8");

  // Same extraction as the block above: Step 2-post's body now lives in a
  // conditional-loading companion. Resolved from the pointer, not hardcoded.
  const pointer = skill.match(
    /### Step 2-post: Integration Gate\s*\n\s*\n> \*\*Conditional loading:\*\* Read `([^`]+)`/,
  );
  assert.ok(
    pointer,
    "Step 2-post must carry a `Conditional loading:` pointer to its companion",
  );
  const content = readFileSync(join(__dirname, "..", "..", pointer[1]), "utf8");

  // Bounding used to be necessary because Step 2h sits in the same file and
  // legitimately reads governance/gates.yaml directly, so unbounded assertions
  // would have caught it. Extraction makes the companion the bound: it contains
  // Step 2-post and nothing else, so `section` is the whole file.
  const start = content.indexOf("# Step 2-post: Integration Gate");
  const section = content;

  it("locates a bounded Step 2-post section", () => {
    assert.ok(start > -1, "Step 2-post heading must exist in the companion");
    // The bound is now the file boundary. Assert the companion did not absorb a
    // neighbouring step during extraction — that would silently widen every
    // assertion below and reintroduce the Step 2h false-positive this guards.
    // Checked on HEADINGS, not prose: the body legitimately cross-references
    // Step 2h and Step 3 in sentences, and forbidding the words would fail on
    // correct content.
    const headings = content.split("\n").filter((l) => /^#{1,3} /.test(l));
    assert.equal(
      headings.length,
      1,
      `companion must contain exactly one section heading, got: ${headings.join(" | ")}`,
    );
    assert.match(headings[0], /Step 2-post: Integration Gate/);
  });

  it("sources integration gates from the merged gate list via adev domain load-gates", () => {
    assert.ok(section.includes("adev domain load-gates"),
      "Step 2-post must name the `adev domain load-gates` CLI verb as the gate source");
    assert.ok(section.includes("merged"),
      "Step 2-post must describe the gate source as the merged gate list");
  });

  it("does not instruct a direct read of governance/gates.yaml as the gate source", () => {
    assert.ok(!/Read\s+`governance\/gates\.yaml`/.test(section),
      "Step 2-post must not instruct a direct read of governance/gates.yaml");
    assert.ok(!/defined in `governance\/gates\.yaml`/.test(section),
      "Step 2-post must not describe the gate set as defined in governance/gates.yaml");
  });

  it("no longer declares tier-uniform severity", () => {
    assert.ok(!content.includes("Individual commands do not have their own severity."),
      "The tier-uniform severity sentence must not survive anywhere in the file");
    assert.ok(!content.includes("All commands within the integration tier share the tier's severity"),
      "The tier-uniform severity sentence must not survive anywhere in the file");
  });

  it("states that a gate's own severity wins over the tier default", () => {
    assert.ok(/own `severity`/.test(section),
      "Step 2-post must state that a gate's own `severity` applies when present");
    assert.ok(section.includes("tier default"),
      "Step 2-post must name the tier default as the fallback");
    assert.ok(/`required: false`/.test(section) && section.includes("warning"),
      "Step 2-post must state that `required: false` forces warning severity");
  });

  it("guards empty, absent, or non-argv commands as skipped with a named reason", () => {
    assert.ok(section.includes("skipped"),
      "Step 2-post must record non-executable gates as skipped");
    assert.ok(section.includes("argv"),
      "Step 2-post must require an argv-list command");
    assert.ok(/named reason/.test(section),
      "Step 2-post must record a named reason for a skipped gate");
    assert.ok(section.includes("unwired sentinel"),
      "Step 2-post must name the unwired sentinel as a skip reason");
  });

  it("applies the D3 deterministic default rather than requiring a literal kind", () => {
    assert.ok(section.includes("deterministic"),
      "Step 2-post must state the deterministic default for merged entries");
    assert.ok(section.includes("drops `kind`") || section.includes("no `kind`"),
      "Step 2-post must state that the merged list drops `kind`, so absent means deterministic");
  });

  it("surfaces loader warnings rather than swallowing them", () => {
    assert.ok(section.includes("INVALID_GATE") && section.includes("GATE_OVERRIDE"),
      "Step 2-post must surface loader warnings by name");
  });

  it("reports skipped gates in the completion report", () => {
    assert.ok(/Integration Gates/.test(section) && /skipped/.test(section),
      "The Integration Gates completion-report section must include skipped gates");
  });

  it("contains no inline-Node directive (constitution guard)", () => {
    assert.ok(!/node\s+-e/.test(section), "no `node -e` in Step 2-post");
    assert.ok(!/node --input-type=module -e/.test(section),
      "no `node --input-type=module -e` in Step 2-post");
    assert.ok(!/Run inline Node/i.test(section), "no `Run inline Node` heading in Step 2-post");
  });
});
