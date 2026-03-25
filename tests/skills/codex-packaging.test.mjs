import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const CODEx_SKILLS_ROOT = join(import.meta.dirname, "..", "..", "providers", "codex", "skills");

describe("Codex skill packaging", () => {
  const skillNames = readdirSync(CODEx_SKILLS_ROOT);

  for (const skillName of skillNames) {
    const skillDir = join(CODEx_SKILLS_ROOT, skillName);
    const skillMdPath = join(skillDir, "SKILL.md");
    const openaiYamlPath = join(skillDir, "agents", "openai.yaml");

    it(`${skillName} includes SKILL.md and agents/openai.yaml`, () => {
      assert.ok(existsSync(skillMdPath), `${skillName} should include SKILL.md`);
      assert.ok(existsSync(openaiYamlPath), `${skillName} should include agents/openai.yaml`);
    });

    it(`${skillName} metadata exposes required interface fields`, () => {
      const content = readFileSync(openaiYamlPath, "utf8");

      assert.match(content, /display_name: ".+"/);
      assert.match(content, /short_description: ".+"/);
      assert.match(content, /default_prompt: ".+\$[a-z0-9-]+.+"/);
    });
  }
});
