import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Mirrors FRONTMATTER_BYTE_LIMIT in lib/providers/copilot/skill-validator.mjs.
// extractFrontmatterName() refuses to parse a SKILL.md above this size, so a
// skill that crosses it takes the whole Copilot adapter down with it: install,
// uninstall, status and dry-run all fail with INVALID_SKILL_FRONTMATTER.
const FRONTMATTER_BYTE_LIMIT = 64 * 1024;

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SKILLS_DIR = join(REPO_ROOT, "skills");

function skillFiles() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, path: join(SKILLS_DIR, e.name, "SKILL.md") }))
    .filter((s) => {
      try {
        return statSync(s.path).isFile();
      } catch {
        return false;
      }
    });
}

// The failure this guards against surfaced as ten unrelated-looking copilot
// adapter failures, none of which named the oversized skill. Fail here first,
// and name it.
test("every SKILL.md stays under the Copilot frontmatter byte limit", () => {
  const oversized = skillFiles()
    .map((s) => ({ ...s, size: statSync(s.path).size }))
    .filter((s) => s.size > FRONTMATTER_BYTE_LIMIT)
    .map((s) => `${s.name} (${s.size} > ${FRONTMATTER_BYTE_LIMIT}, over by ${s.size - FRONTMATTER_BYTE_LIMIT})`);

  assert.deepEqual(
    oversized,
    [],
    `SKILL.md over the ${FRONTMATTER_BYTE_LIMIT}-byte Copilot limit. Move reference material into a companion .md in the skill directory (see skills/implement/tdd-mandate.md) and link it from the skill body.`,
  );
});
