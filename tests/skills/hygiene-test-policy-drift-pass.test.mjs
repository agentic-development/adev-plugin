import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/hygiene/SKILL.md", import.meta.url), "utf8");

test("hygiene SKILL.md adds an Audit Pass reporting floor_inputs: unavailable tasks", () => {
  assert.match(skill, /## Audit Pass 22/);
  assert.match(skill, /floor_inputs.*unavailable/s);
});

test("new pass names the plan and task id for each flagged task", () => {
  const passStart = skill.indexOf("## Audit Pass 22");
  const passBody = skill.slice(passStart, passStart + 1500);
  assert.match(passBody, /plan/i);
  assert.match(passBody, /task[_ ]id/i);
});
