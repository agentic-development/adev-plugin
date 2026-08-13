import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("implement SKILL.md — unified integration gate", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "implement", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

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
  const content = readFileSync(skillPath, "utf8");

  // Bound the assertions to Step 2-post: Step 2h legitimately reads
  // governance/gates.yaml directly and must not be caught by them.
  const start = content.indexOf("### Step 2-post: Integration Gate");
  const end = content.indexOf("### Step 3: Final Review", start);
  const section = content.substring(start, end);

  it("locates a bounded Step 2-post section", () => {
    assert.ok(start > -1, "Step 2-post heading must exist");
    assert.ok(end > start, "Step 3 heading must follow Step 2-post");
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
