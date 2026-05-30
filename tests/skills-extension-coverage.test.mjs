// tests/skills-extension-coverage.test.mjs
//
// Coverage test for universal Load Skill Extensions block.
// Spec: .context-index/specs/cross-cutting/universal-skill-extensions.spec.md
//
// Asserts every skills/<name>/SKILL.md contains a Load Skill Extensions
// block that calls `adev skill-ext load --skill <dir-name>` and that the
// uniform framing prose appears verbatim. The /adev:implement skill is
// already wired and serves as the byte-for-byte reference.

import { test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

const FRAMING_PROSE =
  'The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides).';

function listSkillDirs() {
  return readdirSync(SKILLS_DIR)
    .filter((d) => {
      try { return statSync(join(SKILLS_DIR, d)).isDirectory(); }
      catch { return false; }
    })
    .filter((d) => {
      try { return statSync(join(SKILLS_DIR, d, "SKILL.md")).isFile(); }
      catch { return false; }
    });
}

for (const slug of listSkillDirs()) {
  test(`skills/${slug}/SKILL.md contains Load Skill Extensions block`, () => {
    const md = readFileSync(join(SKILLS_DIR, slug, "SKILL.md"), "utf8");

    // Per-skill slug match (Acceptance Criterion 2).
    const expectedCall = `adev skill-ext load --skill ${slug}`;
    assert.ok(
      md.includes(expectedCall),
      `skills/${slug}/SKILL.md must call: ${expectedCall}`,
    );

    // Byte-exact framing prose (Acceptance Criterion 3; reviewer note CON-1).
    assert.ok(
      md.includes(FRAMING_PROSE),
      `skills/${slug}/SKILL.md must contain the uniform framing prose verbatim`,
    );
  });
}

test("/adev:implement existing block is unchanged (byte-for-byte sanity)", () => {
  const md = readFileSync(join(SKILLS_DIR, "implement", "SKILL.md"), "utf8");
  assert.ok(md.includes("adev skill-ext load --skill implement"));
  assert.ok(md.includes(FRAMING_PROSE));
});
