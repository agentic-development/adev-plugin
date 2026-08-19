import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skill = readSkillSurface("implement");

test("implement SKILL.md calls adev test-policy resolve before write-test dispatch (+3 more contract assertions)", () => {
  // implement SKILL.md calls adev test-policy resolve before write-test dispatch
  assert.match(skill, /adev test-policy resolve/);

  // implement SKILL.md calls adev test-policy assert-assigned after accepting a suite
  assert.match(skill, /adev test-policy assert-assigned/);

  // implement SKILL.md fails the step with MISSING_DEPTH_ASSIGNMENT on a missing event
  assert.match(skill, /MISSING_DEPTH_ASSIGNMENT/);

  // implement SKILL.md passes the resolved depth into the write-test subagent prompt
  assert.match(skill, /resolved depth into the write-test/i);
});
