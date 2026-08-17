import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");

function frontmatterDescription() {
  const md = readFileSync(SKILL_MD, "utf8");
  const match = md.match(/^description:\s*"([\s\S]*?)"\s*$/m);
  assert.ok(match, "using-adev SKILL.md must have a description frontmatter field");
  return match[1];
}

test("using-adev description frontmatter triggers on 'what should I do' style questions", () => {
  const description = frontmatterDescription();
  assert.match(description, /what should I do/i);
});

test("using-adev description frontmatter triggers on 'how does X work' style questions", () => {
  const description = frontmatterDescription();
  assert.match(description, /how does .* work/i);
});

test("using-adev description frontmatter keeps the existing 'what skills are available' trigger", () => {
  const description = frontmatterDescription();
  assert.match(description, /what skills are available/i);
});
