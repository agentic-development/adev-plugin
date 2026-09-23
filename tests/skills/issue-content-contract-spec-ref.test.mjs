// Spec: .context-index/specs/features/task-management/issue-content-contract.spec.md
//       BEH-3

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const SKILL = "skills/issues/SKILL.md";
const read = (p) => readFileSync(p, "utf8");

test("BEH-3: Create Issue section documents --spec-ref pass-through", () => {
  const md = read(SKILL);
  const start = md.indexOf("### Create Issue");
  const rest = md.slice(start);
  const end = rest.indexOf("\n### ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);

  assert.match(section, /--spec-ref/);
  assert.match(section, /spec_ref/);
});

test("Arguments block lists --spec-ref for create", () => {
  const md = read(SKILL);
  const argsStart = md.indexOf("## Arguments");
  const argsEnd = md.indexOf("\n## ", argsStart + 1);
  const args = md.slice(argsStart, argsEnd === -1 ? undefined : argsEnd);
  assert.match(args, /create.*--spec-ref/s);
});
