import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../../skills/init/SKILL.md", import.meta.url), "utf8");
const manifestTemplate = readFileSync(new URL("../../templates/manifest-template.yaml", import.meta.url), "utf8");

test("init SKILL.md emits literal test_policy.granularity into manifest.yaml", () => {
  assert.match(skill, /test_policy/);
  assert.match(skill, /granularity/);
});

test("init SKILL.md guards against an unsubstituted {{ }} placeholder with UNSUBSTITUTED_POLICY_PLACEHOLDER", () => {
  assert.match(skill, /UNSUBSTITUTED_POLICY_PLACEHOLDER/);
});

test("init SKILL.md does not emit sensitive-paths.yaml on greenfield init", () => {
  assert.match(skill, /does not.*sensitive-paths\.yaml|built-in default applies/i);
});

test("init --brownfield proposes inferred granularity with evidence", () => {
  assert.match(skill, /inferGranularity|inferred granularity/i);
});

test("manifest-template.yaml carries no unfilled test_policy placeholder", () => {
  if (manifestTemplate.includes("test_policy")) {
    assert.doesNotMatch(manifestTemplate.slice(manifestTemplate.indexOf("test_policy")), /\{\{\s*\}\}/);
  }
});
