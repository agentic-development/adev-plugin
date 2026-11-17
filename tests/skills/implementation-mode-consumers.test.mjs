// /adev:plan and /adev:implement must read `implementation_mode`. Before this
// existed, only /adev:init and `adev implementation-mode` read it: plan wrote
// every task RED -> GREEN, the plan reviewer rejected any task without a
// test-first step, and implement inlined tdd-mandate.md into every prompt, so a
// project that chose agent-default (first in /adev:init's menu) got strict TDD.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const PLAN_BODY = read("skills/plan/SKILL.md");
const PLAN_CONTEXT = read("skills/plan/references/steps/step-2-load-context.md");
const PLAN_TEMPLATE = read("skills/plan/references/test-infrastructure-requirements.md");
const PLAN_HEADER = read("skills/plan/references/steps/step-5-write-the-plan.md");
const PLAN_REVIEWER = read("skills/plan/references/plan-reviewer-prompt.md");
const IMPL_BODY = read("skills/implement/SKILL.md");
const IMPL_CONTEXT = read("skills/implement/references/steps/step-1-load-context.md");
const IMPL_LOOP = read("skills/implement/references/steps/step-2-per-task-loop.md");
const CHECKLIST = read("skills/implement/references/code-quality-checklist.md");
const SYNTH = read("skills/implement/synthesized-reviewer-prompt.md");
const STATUS = read("skills/status/references/modes/spec-mode.md");
const MANDATES = {
  tdd: "skills/implement/references/tdd-mandate.md",
  "test-required": "skills/implement/references/test-required-mandate.md",
  "agent-default": "skills/implement/references/agent-default-mandate.md",
};
const INTEGRITY = "skills/implement/references/test-integrity.md";

test("plan resolves the mode, records it in the header, and has a step list per mode (B1)", () => {
  assert.match(PLAN_CONTEXT, /adev implementation-mode resolve/);
  assert.match(PLAN_HEADER, /> \*\*Implementation mode:\*\* <mode>/);
  for (const mode of ["tdd", "test-required", "agent-default"]) {
    assert.match(PLAN_TEMPLATE, new RegExp("Steps for `" + mode + "`"), `missing step list for ${mode}`);
  }
  assert.match(PLAN_TEMPLATE, /under `agent-default`[^\n]*`\*\*Tests:\*\*`[^\n]*optional/i);
  assert.ok(!/Every task follows TDD/.test(PLAN_BODY), "plan body must not describe TDD as unconditional");
  assert.ok(!/Each task follows TDD\./.test(PLAN_TEMPLATE));
});

test("the plan reviewer's test criterion follows the plan's recorded mode (B2)", () => {
  assert.ok(!/No task skips the test-first step\./.test(PLAN_REVIEWER));
  assert.match(PLAN_REVIEWER, /\*\*Test Discipline\*\*[^\n]*Implementation mode/);
});

test("implement resolves the mode once and selects the mandate by mode; integrity in every mode (B3-B4)", () => {
  assert.match(IMPL_CONTEXT, /adev implementation-mode resolve/);
  for (const [mode, file] of Object.entries(MANDATES)) {
    assert.ok(existsSync(join(ROOT, file)), `${file} must exist`);
    assert.ok(IMPL_LOOP.includes(`\`${mode}\``) && IMPL_LOOP.includes(`<ADEV_ROOT>/${file}`),
      `the loop must route ${mode} to ${file}`);
  }
  assert.ok(existsSync(join(ROOT, INTEGRITY)));
  assert.match(IMPL_LOOP, new RegExp(`<ADEV_ROOT>/${INTEGRITY.replace(/[.]/g, "\\.")}\`[^\\n]*every mode`));
  assert.ok(!/7\. \*\*TDD mandate\.\*\* This section is non-negotiable\./.test(IMPL_LOOP));

  const tdd = read(MANDATES.tdd);
  assert.ok(!/### Test Integrity/.test(tdd), "integrity moved out of the tdd mandate");
  assert.match(tdd, /No production code without a failing test first[\s\S]*If you wrote code before the test, delete it/,
    "the delete-and-start-over rule belongs with the TDD block");
  assert.ok(!/failing test first/i.test(read(MANDATES["agent-default"])));
  assert.ok(!/failing test first/i.test(read(MANDATES["test-required"])));
});

test("the resolved mode supersedes a plan written under another mode (B5)", () => {
  assert.match(IMPL_LOOP, /supersedes the task's step order/);
});

test("test depth is resolved and asserted only outside agent-default (B6)", () => {
  assert.match(IMPL_LOOP, /\*\*Test Depth Resolution \(`tdd` and `test-required`\):\*\*/);
  assert.match(IMPL_LOOP, /Under `agent-default`[^\n]*neither[^\n]*`adev test-policy resolve`[^\n]*`assert-assigned`/);
  assert.ok(!/Test Depth/.test(read(MANDATES["agent-default"])));
  assert.match(read(MANDATES["test-required"]), /### Test Depth/);
});

test("reviewers get the mode and apply a per-mode test criterion (B7)", () => {
  assert.ok(!/^- TDD was followed: test files exist, tests are meaningful, test-first evidence$/m.test(CHECKLIST));
  for (const mode of ["tdd", "test-required", "agent-default"]) {
    assert.match(CHECKLIST, new RegExp("`" + mode + "`:"), `checklist must name ${mode}`);
  }
  assert.match(CHECKLIST, /`test-required`:[^\n]*Important/);
  assert.match(IMPL_LOOP, /Stage 2[\s\S]{0,4000}Implementation mode:/);
  assert.match(SYNTH, /implementation mode/i);
});

test("status shows the mode and explains a zero depth count under agent-default (B8)", () => {
  assert.match(STATUS, /adev implementation-mode resolve/);
  assert.match(STATUS, /agent-default[^\n]*expected/);
});

test("no implement or route instruction describes TDD as unconditional", () => {
  assert.ok(!/Skip TDD for any task \(RED-GREEN-REFACTOR, no exceptions\)/.test(IMPL_BODY));
  assert.ok(!/with TDD enforcement and/.test(IMPL_BODY));
  assert.ok(!/The per-task TDD loop/.test(read("skills/implement/references/batched-mode.md")));
  assert.ok(!/The per-task TDD loop/.test(read("skills/implement/references/parallel-mode.md")));
  assert.ok(!/implements the full TDD cycle/.test(read("skills/route/SKILL.md")));
});
