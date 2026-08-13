import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/status/SKILL.md", import.meta.url), "utf8");

test("status SKILL.md counts completion via adev state current, not file existence", () => {
  assert.match(skill, /adev state current --spec/);
});

test("status SKILL.md no longer instructs a raw test-file-existence check for completion", () => {
  assert.equal(skill.includes("Check if test files exist"), false);
});
