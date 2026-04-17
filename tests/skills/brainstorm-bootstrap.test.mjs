import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "brainstorm", "SKILL.md");

describe("adev:brainstorm SKILL.md — product.md bootstrap (Step 5b)", () => {
  let content;

  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/brainstorm/SKILL.md must exist");
    content = readFileSync(SKILL_PATH, "utf8");
  });

  it("SKILL.md documents the --no-bootstrap flag in the Arguments section", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("--no-bootstrap"),
      "Must document --no-bootstrap flag"
    );
    assert.ok(
      c.includes("suppress") || c.includes("skip"),
      "Must describe suppression/skip behavior for --no-bootstrap"
    );
  });

  it("SKILL.md includes a Step 5b heading for Product.md Bootstrap", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Step 5b") || c.includes("## Step 5b"),
      "Must include Step 5b heading"
    );
    assert.ok(
      c.includes("Bootstrap") || c.includes("bootstrap"),
      "Step 5b must reference bootstrap"
    );
  });

  it("SKILL.md Step 5b is placed after Step 5 (Write Charter) and before Step 6 (Charter Review Loop)", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const step5Idx = c.indexOf("## Step 5: Write Charter");
    const step5bIdx = c.indexOf("## Step 5b");
    const step6Idx = c.indexOf("## Step 6: Charter Review Loop");
    assert.ok(step5Idx !== -1, "Step 5 must exist");
    assert.ok(step5bIdx !== -1, "Step 5b must exist");
    assert.ok(step6Idx !== -1, "Step 6 must exist");
    assert.ok(step5Idx < step5bIdx, "Step 5b must appear after Step 5");
    assert.ok(step5bIdx < step6Idx, "Step 5b must appear before Step 6");
  });

  it("SKILL.md Step 5b includes the bootstrap question text", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("What is the product trying to do, in one sentence"),
      "Must include the one-sentence vision question"
    );
    assert.ok(
      c.includes("product vision") || c.includes("product.md"),
      "Must reference product vision or product.md"
    );
  });

  it("SKILL.md Step 5b documents first-charter detection via glob", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("charter.md") && (c.includes("Glob") || c.includes("glob")),
      "Must describe globbing for charter.md files to detect first charter"
    );
    assert.ok(
      c.includes("first charter") || c.includes("First Charter"),
      "Must use the phrase 'first charter' for detection"
    );
  });

  it("SKILL.md Step 5b describes Module Map append for subsequent charters", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Module Map Append") || c.includes("module map append") || c.includes("5b-4"),
      "Must include Module Map Append sub-step"
    );
    assert.ok(
      c.includes("idempotent") || c.includes("Idempotency"),
      "Must describe idempotent append (no duplicate rows)"
    );
  });

  it("SKILL.md Step 5b states that --module (revision mode) skips bootstrap and Module Map append", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("--module") && (c.includes("revision mode") || c.includes("revising")),
      "Must mention --module revision mode skip"
    );
  });

  it("SKILL.md Step 5b handles malformed product.md gracefully", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("malformed") || c.includes("cannot be parsed"),
      "Must handle malformed product.md edge case"
    );
    assert.ok(
      c.includes("please update manually") || c.includes("update manually"),
      "Must tell user to update manually on malformed product.md"
    );
  });

  it("SKILL.md Step 5b describes auto-creation of Module Map section if missing", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("no `## Module Map` section") || c.includes("no ## Module Map") || c.includes("has no `## Module Map`"),
      "Must describe behavior when Module Map section is absent"
    );
    assert.ok(
      c.includes("Created Module Map section"),
      "Must include the 'Created Module Map section' user-facing message"
    );
  });

  it("SKILL.md Step 5b describes the product.md template with title, vision, Module Map, and Milestones", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("# Product Vision:") || c.includes("Product Vision:"),
      "Must include title format with 'Product Vision:'"
    );
    assert.ok(
      c.includes("## Vision") || c.includes("Vision"),
      "Must include Vision section in product.md template"
    );
    assert.ok(
      c.includes("## Module Map") || c.includes("Module Map"),
      "Must include Module Map section in product.md template"
    );
    assert.ok(
      c.includes("## Milestones") || c.includes("Milestones"),
      "Must reference Milestones section in product.md"
    );
  });

  it("SKILL.md Step 5b describes the bootstrap completion message", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      c.includes("Bootstrapped product.md"),
      "Must include the 'Bootstrapped product.md' completion message"
    );
    assert.ok(
      c.includes("/adev:plan --milestone"),
      "Must include the /adev:plan --milestone hint in the completion message"
    );
  });

  it("SKILL.md checklist includes Step 5b entry", () => {
    const c = readFileSync(SKILL_PATH, "utf8");
    const checklistMatch = c.match(/## Checklist[\s\S]*?---/);
    assert.ok(checklistMatch, "Must have a Checklist section");
    assert.ok(
      checklistMatch[0].includes("5b"),
      "Checklist must include Step 5b"
    );
    assert.ok(
      checklistMatch[0].includes("--no-bootstrap"),
      "Checklist Step 5b entry must mention --no-bootstrap"
    );
  });
});
