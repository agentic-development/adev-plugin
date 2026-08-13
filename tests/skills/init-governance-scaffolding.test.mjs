import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("init SKILL.md — governance scaffolding", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "init", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  it("should scaffold governance/gates.yaml from template", () => {
    assert.ok(content.includes("gates.yaml") && content.includes("template"),
      "Init should generate gates.yaml from template");
  });

  it("should detect legacy gates in manifest.yaml", () => {
    assert.ok(content.includes("Legacy gates") || content.includes("legacy gates"),
      "Init should detect legacy gates: section in manifest");
  });

  it("should offer migration path for legacy gates", () => {
    assert.ok(content.includes("governance/gates.yaml"),
      "Init should reference governance/gates.yaml for migration");
  });
});

describe("init SKILL.md — Step 7a seeds both gate tiers in argv form", () => {
  const skillPath = join(__dirname, "..", "..", "skills", "init", "SKILL.md");
  const content = readFileSync(skillPath, "utf8");

  // Bound to Step 7a only — the test-policy prose and sub-steps 7b-7e that
  // follow are out of scope for this contract.
  const start = content.indexOf("### Step 7a: Foundation files");
  const end = content.indexOf("\n### ", start + 1);
  const section = content.substring(start, end === -1 ? content.length : end);

  it("locates a bounded Step 7a section", () => {
    assert.ok(start > -1, "Step 7a heading must exist");
    assert.ok(section.includes("gates.yaml"), "Step 7a must cover gates.yaml");
  });

  it("names both the fast tier and the integration tier as seeded targets", () => {
    assert.ok(/fast[- ]tier/i.test(section), "Step 7a must name the fast tier");
    assert.ok(/integration[- ]tier/i.test(section), "Step 7a must name the integration tier");
    assert.ok(section.includes("`test`") && section.includes("`integration-test`"),
      "Step 7a must name both live template gate ids");
  });

  it("states that seeded commands are argv lists, never shell strings", () => {
    assert.ok(section.includes("argv"), "Step 7a must state commands are argv lists");
    assert.ok(/never shell strings|not shell strings|never a shell string/i.test(section),
      "Step 7a must state that a shell string is not accepted");
    assert.ok(section.includes("command: [npm, test]"),
      "Step 7a must show an argv-form example for the fast tier");
  });

  it("names the --if-present no-op idiom for the integration tier", () => {
    assert.ok(section.includes("--if-present"),
      "Step 7a must name the --if-present no-op idiom");
    assert.ok(section.includes("command: [npm, run, --if-present, test:integration]"),
      "Step 7a must show the argv-form integration example");
  });

  it("states that an unseeded gate keeps the empty-string sentinel and warns at load", () => {
    assert.ok(section.includes('command: ""'),
      "Step 7a must state that an unseeded gate keeps command: \"\"");
    assert.ok(section.includes("INVALID_GATE"),
      "Step 7a must name the INVALID_GATE warning emitted at load");
    assert.ok(section.includes("merge-gates.mjs"),
      "Step 7a must name the loader that enforces the argv-only rule");
  });

  it("does not emit a placeholder into a command value", () => {
    assert.ok(!/command:\s*\[?\s*\{\{/.test(section),
      "Step 7a must not seed a {{ }} placeholder into a command value");
  });

  it("contains no inline-Node directive (constitution guard)", () => {
    assert.ok(!/node\s+-e/.test(section), "no `node -e` in Step 7a");
    assert.ok(!/node --input-type=module -e/.test(section),
      "no `node --input-type=module -e` in Step 7a");
    assert.ok(!/Run inline Node/i.test(section), "no `Run inline Node` heading in Step 7a");
  });
});
