import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/plan/SKILL.md", import.meta.url), "utf8");

test("plan SKILL.md documents granularity-driven Tests: field emission", () => {
  assert.match(skill, /### Granularity Assignment/);
  assert.match(skill, /resolveGranularity/);
});

test("plan SKILL.md still mandates a **Files:** block on every emitted task (Behavior 2)", () => {
  assert.match(skill, /every task .*carries its own \*\*Files:\*\* block/i);
});

test("plan SKILL.md instructs an 'extend' wording when a suite already covers the behavior", () => {
  assert.match(skill, /extend/i);
});

test("plan SKILL.md contains no inline-Node or eval in the new section", () => {
  const section = skill.slice(skill.indexOf("### Granularity Assignment"));
  assert.doesNotMatch(section, /node -e|node --input-type=module -e/);
});
