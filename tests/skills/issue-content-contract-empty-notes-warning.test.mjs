// tests/skills/issue-content-contract-empty-notes-warning.test.mjs
//
// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-4

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-4: Create Issue section documents the empty-body soft warning, never a block", () => {
  const md = read(SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /was created without a body/i);
  assert.match(section, /adev:issues update.*--notes/);
  assert.doesNotMatch(section, /block(s|ed)? creation/i);
});
