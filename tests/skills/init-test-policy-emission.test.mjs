import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skill = readSkillSurface("init");
const manifestTemplate = readFileSync(new URL("../../templates/manifest-template.yaml", import.meta.url), "utf8");

test("init SKILL.md emits literal test_policy.granularity into manifest.yaml (+4 more contract assertions)", () => {
  // init SKILL.md emits literal test_policy.granularity into manifest.yaml
  assert.match(skill, /test_policy/);
  assert.match(skill, /granularity/);

  // init SKILL.md guards against an unsubstituted {{ }} placeholder with UNSUBSTITUTED_POLICY_PLACEHOLDER
  assert.match(skill, /UNSUBSTITUTED_POLICY_PLACEHOLDER/);

  // init SKILL.md does not emit sensitive-paths.yaml on greenfield init
  assert.match(skill, /does not.*sensitive-paths\.yaml|built-in default applies/i);

  // init --brownfield proposes inferred granularity with evidence
  assert.match(skill, /inferGranularity|inferred granularity/i);

  // manifest-template.yaml carries no unfilled test_policy placeholder
  assert.ok(
  manifestTemplate.includes("test_policy"),
  "manifest-template.yaml must contain a test_policy block — an absent block is a failure, not a pass"
  );
  assert.doesNotMatch(manifestTemplate.slice(manifestTemplate.indexOf("test_policy")), /\{\{\s*\}\}/);
});
