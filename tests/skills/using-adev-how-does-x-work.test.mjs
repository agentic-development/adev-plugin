import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");
const md = () => readFileSync(SKILL_MD, "utf8");

function section() {
  const content = md();
  const idx = content.search(/How does X work\?/);
  assert.notEqual(idx, -1, "using-adev must document a 'How does X work?' Q&A mode");
  return content.slice(idx, idx + 2500);
}

test("using-adev documents a 'How does X work?' Q&A mode", () => {
  assert.match(md(), /How does X work\?/);
});

test("'How does X work?' mode checks docs/*.md before falling back to SKILL.md", () => {
  const s = section();
  assert.match(s, /docs\/\*\.md|docs\/skill-reference\.md/);
  assert.match(s, /fall\s*back/i);
  assert.match(s, /skills\/<name>\/SKILL\.md|skills\/\S+\/SKILL\.md/);
});

test("'How does X work?' mode handles an unknown skill name by listing closest matches", () => {
  const s = section();
  assert.match(s, /not found/i);
  assert.match(s, /closest matching/i);
});

test("'How does X work?' mode documents the ambiguity resolution rule", () => {
  const s = section();
  assert.match(s, /ambiguous/i);
  assert.match(s, /specific skill name/i);
});
