import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_MD = resolve(__dirname, "..", "..", "skills", "using-adev", "SKILL.md");
const md = () => readFileSync(SKILL_MD, "utf8");

test("using-adev documents a 'What should I do?' Q&A mode", () => {
  assert.match(md(), /What should I do\?/);
});

test("'What should I do?' mode always defers the routing decision to /adev:work", () => {
  const content = md();
  const idx = content.search(/What should I do\?/);
  assert.notEqual(idx, -1);
  const section = content.slice(idx, idx + 1500);
  assert.match(section, /\/adev:work/);
  assert.match(section, /never|does not (perform|decide)/i);
});

test("'What should I do?' mode explains conceptually, not with a concrete routing decision", () => {
  const content = md();
  const idx = content.search(/What should I do\?/);
  const section = content.slice(idx, idx + 1500);
  assert.match(section, /conceptual/i);
});
