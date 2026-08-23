// tests/skills/issue-content-contract-epic-notes.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-5

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const PLAN_SKILL = "skills/plan/SKILL.md";
const FEATURE_MODE = "skills/plan/feature-mode.md";
const RELEASE_MODE = "skills/plan/release-mode.md";
const read = (p) => readFileSync(p, "utf8");

function issueCreationSubsection(md) {
  const start = md.indexOf("Issue creation (optional, board-granularity only)");
  assert.notEqual(start, -1, "Issue creation subsection not found");
  const rest = md.slice(start);
  const end = rest.indexOf("\nIf `tasks.backend` is not configured");
  return end === -1 ? rest : rest.slice(0, end);
}

test("BEH-5: standard-mode adev issues epic invocation passes a notes summary, not title+plan-ref only", () => {
  const section = issueCreationSubsection(read(PLAN_SKILL));
  assert.match(section, /adev issues epic ".*--plan-ref .*--notes /s);
});

test("Postconditions: feature-mode's Charter: <module> notes tag is unchanged", () => {
  assert.match(read(FEATURE_MODE), /notes: "Charter: <module>"/);
});

test("Postconditions: release-mode's Release: <name> notes tag is unchanged", () => {
  assert.match(read(RELEASE_MODE), /notes: "Release: <release-name>"/);
});
