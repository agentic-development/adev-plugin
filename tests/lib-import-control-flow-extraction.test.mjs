// tests/lib-import-control-flow-extraction.test.mjs
//
// Spec: .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
//
// Locks the migration of three fenced-JavaScript control-flow sites in
// skills/plan/SKILL.md and skills/implement/SKILL.md into the existing
// `adev <verb>` CLI surface (state current, state events --event plan_task,
// report --type plan-task --status <s>).
//
// AC 1 — the named-import shape (currentState / reportPlanTask / filterEvents
//        from lib/lifecycle-state.mjs) must be gone from both files.
// AC 2 — each migrated site contains the matching `adev <verb>` invocation.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PLAN_SKILL = readFileSync("skills/plan/SKILL.md", "utf8");
const IMPL_SKILL = readFileSync("skills/implement/SKILL.md", "utf8");

// AC 1 — the named-import shape must be gone from both files.
const FORBIDDEN_IMPORT =
  /import \{ (currentState|reportPlanTask|filterEvents)(, (currentState|reportPlanTask|filterEvents))* \} from '<ADEV_ROOT>\/lib\/lifecycle-state\.mjs'/;

test("plan/SKILL.md has no lib-import control-flow shape", () => {
  assert.equal(
    FORBIDDEN_IMPORT.test(PLAN_SKILL),
    false,
    "plan/SKILL.md still imports currentState/reportPlanTask/filterEvents in a fenced JS block",
  );
});

test("implement/SKILL.md has no lib-import control-flow shape", () => {
  assert.equal(
    FORBIDDEN_IMPORT.test(IMPL_SKILL),
    false,
    "implement/SKILL.md still imports currentState/reportPlanTask in a fenced JS block",
  );
});

// Behaviors 2, 3, 4 — the migrated verb invocations must be present.

test("plan/SKILL.md Step 7 references adev state events --event plan_task", () => {
  assert.match(
    PLAN_SKILL,
    /adev state events[^\n]*--event plan_task/,
    "plan/SKILL.md Step 7 must invoke `adev state events --event plan_task` for re-plan detection",
  );
});

test("plan/SKILL.md Step 7 references adev report --type plan-task --status pending", () => {
  assert.match(
    PLAN_SKILL,
    /adev report[^\n]*--type plan-task[^\n]*--status pending/,
    "plan/SKILL.md Step 7 must invoke `adev report --type plan-task --status pending` once per task",
  );
});

test("implement/SKILL.md Task Discovery references adev state current", () => {
  assert.match(
    IMPL_SKILL,
    /adev state current[^\n]*--spec/,
    "implement/SKILL.md Task Discovery must invoke `adev state current --spec <p>`",
  );
});

test("implement/SKILL.md references all four plan-task transition statuses", () => {
  for (const status of ["in_progress", "done", "blocked", "skipped"]) {
    const re = new RegExp(`adev report[^\\n]*--type plan-task[^\\n]*--status ${status}`);
    assert.match(
      IMPL_SKILL,
      re,
      `implement/SKILL.md must invoke \`adev report --type plan-task --status ${status}\``,
    );
  }
});
