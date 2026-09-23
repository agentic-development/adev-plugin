// tests/skills/issue-content-contract-template.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-1, BEH-2

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

function createIssueSection(md) {
  const start = md.indexOf("### Create Issue");
  assert.notEqual(start, -1, "no Create Issue section found");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  return end === -1 ? rest : rest.slice(0, end);
}

test("BEH-1: Create Issue section documents the content-template prompt for feature/bug", () => {
  const section = createIssueSection(read(SKILL));
  assert.match(section, /--type (feature\|bug|bug\|feature)/);
  assert.match(section, /Problem\s*\/\s*Intent/i);
  assert.match(section, /Acceptance Criteria/i);
  assert.match(section, /Out of Scope/i);
});

test("BEH-2: Create Issue section exempts --type task from the full template", () => {
  const section = createIssueSection(read(SKILL));
  assert.match(section, /task/i);
  assert.match(section, /one-line|one line/i);
});
