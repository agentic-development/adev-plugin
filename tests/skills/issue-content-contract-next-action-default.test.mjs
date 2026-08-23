// tests/skills/issue-content-contract-next-action-default.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-6

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const ISSUES_SKILL = "skills/issues/SKILL.md";
const EPIC_MODE = "skills/plan/epic-mode.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-6: Create Issue section references the epic-mode Convention Table by name, not by re-deriving it", () => {
  const md = read(ISSUES_SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /next_action Convention Table/i);
  assert.match(section, /epic-mode\.md/);
  assert.doesNotMatch(section, /node\s+-e|node\s+--input-type=module\s+-e/);
});

test("Convention Table still exists in epic-mode.md for the reference to resolve", () => {
  const md = read(EPIC_MODE);
  assert.match(md, /next_action Convention Table/i);
});
