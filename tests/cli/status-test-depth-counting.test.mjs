import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skill = readSkillSurface("status");

test("status SKILL.md counts completion via adev state current, not file existence", () => {
  assert.match(skill, /adev state current --spec/);
});

test("status SKILL.md no longer instructs a raw test-file-existence check for completion", () => {
  assert.equal(skill.includes("Check if test files exist"), false);
});
