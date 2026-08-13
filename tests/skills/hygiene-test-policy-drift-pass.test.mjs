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

test("Report Format summary table includes a Test-Policy Drift row", () => {
  const summaryStart = skill.indexOf("## Summary");
  const summaryEnd = skill.indexOf("## Priority Actions");
  const summaryTable = skill.slice(summaryStart, summaryEnd);
  assert.match(summaryTable, /\|\s*Test-Policy Drift\s*\|/);
});

test("--check enum includes the test-policy-drift slug", () => {
  assert.match(skill, /--check <type>`: run a single pass \([^)]*test-policy-drift[^)]*\)/);
});

test("--check enum includes the test-debt slug", () => {
  assert.match(skill, /--check <type>`: run a single pass \([^)]*\btest-debt\b[^)]*\)/);
});

test("pass-count prose matches the actual number of Audit Pass headings", () => {
  const passHeadings = skill.match(/^## Audit Pass \d+:/gm) ?? [];
  assert.equal(passHeadings.length, 23);
  const words = { 20: "twenty", 21: "twenty-one", 22: "twenty-two", 23: "twenty-three" };
  const word = words[passHeadings.length];
  assert.ok(word, `no word mapping for ${passHeadings.length} passes — extend the map`);
  assert.match(skill, new RegExp(`${word} audit passes`));
  assert.match(skill, new RegExp(`all ${word} passes`));
  assert.match(skill, new RegExp(`each of the ${word} passes`));
});

test("no stale pass-count strings remain", () => {
  assert.doesNotMatch(skill, /\btwenty audit passes\b/i);
  assert.doesNotMatch(skill, /\beighteen passes\b/i);
});
