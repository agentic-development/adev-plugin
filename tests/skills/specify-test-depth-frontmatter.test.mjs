import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skill = readSkillSurface("specify");

test("specify SKILL.md documents test_depth: as legal frontmatter alongside test_strategy:", () => {
  assert.match(skill, /test_depth:/);
});
