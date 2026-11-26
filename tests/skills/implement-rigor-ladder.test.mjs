// tests/skills/implement-rigor-ladder.test.mjs
//
// Skill-text assertions for the implement rigor ladder (full / quick / lite).
// These read SKILL.md directly because they pin WHERE an instruction lives:
// the first-action check-flags call and the no-self-selection rule govern the
// whole invocation, so they must sit in the body, not behind a pointer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT } from "../helpers.mjs";

const body = readFileSync(join(PLUGIN_ROOT, "skills", "implement", "SKILL.md"), "utf8");

// The do-not-double-emit rule for LOOP_* halts must stay byte-identical: the
// BEH-15 halt relies on `plan_task` `blocked` being the recorded terminal, with
// no step_failed emitted alongside it.
const DO_NOT_DOUBLE_EMIT_PARAGRAPH =
  "   **Already covered — do not double-emit.** Per-task escalations terminate through the Step 2d blocker path (`plan_task` `blocked`): the blocker-flag protocol, `MISSING_DEPTH_ASSIGNMENT`, and `LOOP_BUDGET_EXHAUSTED` / `LOOP_NO_PROGRESS` / `LOOP_REGRESSED`. Emit the step-level failed event only when the *whole skill* stops.";

function section(text, heading) {
  const start = text.indexOf(`${heading}\n`);
  if (start === -1) return null;
  const rest = text.slice(start + heading.length + 1);
  const next = rest.search(/^#{2,3} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

const prerequisites = section(body, "## Prerequisites");

test("check-flags is the first action, before adev gate require", () => {
  const cf = body.indexOf("adev implement check-flags");
  const gate = body.indexOf("adev gate require");
  assert.ok(cf > 0, "the body must invoke `adev implement check-flags`");
  assert.ok(gate > 0, "the body must still invoke `adev gate require`");
  assert.ok(cf < gate, "`adev implement check-flags` must precede `adev gate require`");
});

test("check-flags is Prerequisite 1 and the list counts six conditions", () => {
  assert.ok(prerequisites !== null, "missing `## Prerequisites` in the body");
  assert.match(prerequisites, /verify all six conditions/);
  assert.doesNotMatch(prerequisites, /verify all five conditions/);
  const first = /^1\. \*\*[^*]+\*\*.*$/m.exec(prerequisites);
  assert.ok(first, "Prerequisites must open with a numbered condition");
  assert.match(first[0], /check-flags/);
  assert.match(
    prerequisites,
    /adev implement check-flags --spec <spec-path> \[--lite\] \[--tier <t>\] \[--parallel\]/,
  );
});

test("check-flags failure stops the run with stderr surfaced and no event written", () => {
  assert.match(prerequisites, /exits `1`/);
  assert.match(prerequisites, /no lifecycle event has been written/i);
});

test("Arguments document --lite and --tier full|quick|lite", () => {
  assert.match(body, /^- `--lite`/m);
  assert.match(body, /^- `--tier <full\|quick\|lite>`/m);
});

test("no-self-selection rule: lite only from operator input", () => {
  assert.match(body, /never add `--lite` or `--tier lite` on your own judgment/i);
  assert.match(prerequisites, /never add `--lite` or `--tier lite` on your own judgment/i);
  assert.match(prerequisites, /`lite-eligible`[^.]*eligibility signal, not an authorization/);
});

test("run keeps run_base and lite_source from check-flags", () => {
  assert.match(prerequisites, /run_base/);
  assert.match(prerequisites, /lite_source/);
  assert.match(prerequisites, /lite authorized via <lite_source>/);
});

test("check-flags warnings are relayed to the operator", () => {
  assert.match(prerequisites, /LITE_SUPPRESSED_PARALLEL/);
  assert.match(prerequisites, /POLICY_UNCOMMITTED_CHANGES/);
});

test("Red Flags entry reworded", () => {
  assert.match(body, /Skip a review stage the resolved depth requires/);
  assert.doesNotMatch(body, /Skip either review stage/);
});

test("do-not-double-emit paragraph is byte-identical (CON-1)", () => {
  assert.ok(body.includes(DO_NOT_DOUBLE_EMIT_PARAGRAPH));
});
