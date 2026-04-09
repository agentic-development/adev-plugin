import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const SKILL_PATH = join(PLUGIN_ROOT, "skills", "research", "SKILL.md");
const TEMPLATE_PATH = join(PLUGIN_ROOT, "templates", "research-template.md");
const INTERNAL_PROMPT = join(PLUGIN_ROOT, "skills", "research", "internal-researcher-prompt.md");
const WEB_PROMPT = join(PLUGIN_ROOT, "skills", "research", "web-researcher-prompt.md");
const GITHUB_PROMPT = join(PLUGIN_ROOT, "skills", "research", "github-researcher-prompt.md");
const SYNTHESIS_PROMPT = join(PLUGIN_ROOT, "skills", "research", "synthesis-prompt.md");

describe("adev:research template", () => {
  it("research-template.md documents the optional injection_warnings frontmatter field", () => {
    const content = readFileSync(TEMPLATE_PATH, "utf8");
    assert.ok(
      content.includes("injection_warnings"),
      "templates/research-template.md must document the injection_warnings frontmatter field"
    );
  });
});
