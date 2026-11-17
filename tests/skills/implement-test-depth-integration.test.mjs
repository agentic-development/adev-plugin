import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

const skill = readSkillSurface("implement");

test("implement SKILL.md calls adev test-policy resolve before write-test dispatch (+3 more contract assertions)", () => {
  // implement SKILL.md calls adev test-policy resolve before write-test dispatch
  assert.match(skill, /adev test-policy resolve/);

  // implement SKILL.md calls adev test-policy assert-assigned after accepting a suite
  assert.match(skill, /adev test-policy assert-assigned/);

  // implement SKILL.md fails the step with MISSING_DEPTH_ASSIGNMENT on a missing event
  assert.match(skill, /MISSING_DEPTH_ASSIGNMENT/);

  // implement SKILL.md passes the resolved depth into the write-test subagent prompt
  assert.match(skill, /resolved depth into the write-test/i);
});

// Depth used to be resolved only "before dispatching the write-test subagent",
// but the per-task loop never dispatches one: the implementer writes its own
// RED tests under the TDD mandate. Resolution therefore never ran (0
// test_depth_assigned events across 136 tasks in a consumer project), and the
// sensitive-path and risk-level floors never reached whoever wrote the tests.
test("implement resolves test depth for every task and hands it to the implementer", () => {
  const loop = readFileSync(
    new URL("../../skills/implement/references/steps/step-2-per-task-loop.md", import.meta.url),
    "utf8",
  );
  const mandate = readFileSync(
    new URL("../../skills/implement/references/tdd-mandate.md", import.meta.url),
    "utf8",
  );
  const body = readFileSync(new URL("../../skills/implement/SKILL.md", import.meta.url), "utf8");

  assert.ok(!/Before dispatching the write-test subagent, resolve/.test(loop),
    "resolution must not be conditional on a write-test dispatch the loop never makes");
  assert.match(loop, /\*\*Test Depth Resolution \(every task\):\*\*/);
  assert.match(loop, /resolved depth into the implementer prompt/i);
  assert.match(loop, /never resolve twice/i,
    "a task that also dispatches write-test must reuse the one resolved depth");
  assert.match(loop, /after the implementer reports[\s\S]{0,200}adev test-policy assert-assigned/i);

  assert.match(mandate, /Test Depth/, "the TDD mandate must tell the implementer to honour its assigned depth");
  assert.match(mandate, /minimal[\s\S]*standard[\s\S]*thorough/);

  assert.ok(!/dispatch write-test then implement/.test(body),
    "the Step 2 summary must not describe a write-test dispatch that does not happen");
});
