import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "assess", "SKILL.md");

describe("adev:assess skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/assess/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev:assess"), "Must have name field");
    assert.ok(content.includes("description:"), "Must have description field");
  });

  it("SKILL.md defines both raw and adev modes", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--mode raw"), "Must define --mode raw flag");
    assert.ok(content.includes("--mode adev"), "Must define --mode adev flag");
  });

  it("SKILL.md defines 8 structural dimensions", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const dimensions = [
      "Test Infrastructure",
      "Type Safety",
      "Modularity",
      "Naming",
      "Documentation",
      "Dependency Hygiene",
      "Build Configuration",
      "Spec Sources"
    ];
    for (const dim of dimensions) {
      assert.ok(
        content.includes(dim),
        `Must include dimension: ${dim}`
      );
    }
  });

  it("SKILL.md defines 3 adev:specific dimensions", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    const adevDimensions = [
      "Adev Context Index",
      "Adev Skills",
      "Adev Hooks"
    ];
    for (const dim of adevDimensions) {
      assert.ok(
        content.includes(dim),
        `Must include adev dimension: ${dim}`
      );
    }
  });

  it("SKILL.md defines 5 maturity levels", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("L1"), "Must define L1 maturity level");
    assert.ok(content.includes("L2"), "Must define L2 maturity level");
    assert.ok(content.includes("L3"), "Must define L3 maturity level");
    assert.ok(content.includes("L4"), "Must define L4 maturity level");
    assert.ok(content.includes("L5"), "Must define L5 maturity level");
  });

  it("SKILL.md defines --output markdown flag", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--output markdown"), "Must define --output markdown flag");
  });

  it("SKILL.md defines --output json flag", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("--output json"), "Must define --output json flag");
  });

  it("SKILL.md explains static file inspection approach", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("static file inspection") || content.includes("Glob") || content.includes("Grep"),
      "Must explain static file inspection approach"
    );
  });

  it("SKILL.md specifies no external commands are executed", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("no external commands") || content.includes("no npm test") || content.includes("No external"),
      "Must specify no external commands are executed"
    );
  });

  it("SKILL.md defines scoring criteria for each dimension", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("Score"), "Must include scoring criteria");
  });

  it("SKILL.md includes JSON output format example", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("version") || content.includes("\"version\""), "Must include JSON version field");
    assert.ok(content.includes("timestamp") || content.includes("\"timestamp\""), "Must include JSON timestamp field");
    assert.ok(content.includes("totalScore") || content.includes("\"totalScore\""), "Must include JSON totalScore field");
    assert.ok(content.includes("level") || content.includes("\"level\""), "Must include JSON level field");
  });

  it("SKILL.md includes markdown scorecard format", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("## Dimensions"), "Must include dimensions section");
    assert.ok(content.includes("| Dimension |"), "Must include markdown table for dimensions");
  });

  it("SKILL.md uses emoji indicators for scores", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("🟢") || content.includes("🟡") || content.includes("🔴"), "Must include emoji indicators");
  });

  it("SKILL.md describes mode auto-detection", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(
      content.includes("auto-detect") || content.includes(".context-index/"),
      "Must describe mode auto-detection based on .context-index/"
    );
  });
});
