import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "adev-document", "SKILL.md");

describe("adev-document skill", () => {
  it("SKILL.md exists at the correct path", () => {
    assert.ok(existsSync(SKILL_PATH), "skills/adev-document/SKILL.md must exist");
  });

  it("SKILL.md has required frontmatter fields", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter");
    assert.ok(content.includes("name: adev-document"), "Must have name field");
    assert.ok(content.includes("description:"), "Must have description field");
  });

  it("SKILL.md contains architecture generation section", () => {
    const content = readFileSync(SKILL_PATH, "utf8");
    assert.ok(content.includes("architecture.md"), "Must reference architecture.md output");
    assert.ok(content.includes("dependency-graph.json"), "Must reference dependency-graph.json input");
    assert.ok(content.includes("adev:generated"), "Must define the generated content marker");
    assert.ok(content.includes("adev:human"), "Must define the human content marker");
  });
});
