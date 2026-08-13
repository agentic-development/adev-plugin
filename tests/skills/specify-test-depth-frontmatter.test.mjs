import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/specify/SKILL.md", import.meta.url), "utf8");

test("specify SKILL.md documents test_depth: as legal frontmatter alongside test_strategy:", () => {
  assert.match(skill, /test_depth:/);
});
