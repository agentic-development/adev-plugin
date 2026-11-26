// tests/skills/implement-rigor-ladder.test.mjs
//
// Skill-text assertions for the implement rigor ladder (full / quick / lite).
// These read SKILL.md directly because they pin WHERE an instruction lives:
// the first-action check-flags call and the no-self-selection rule govern the
// whole invocation, so they must sit in the body, not behind a pointer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

const REFS = join(PLUGIN_ROOT, "skills", "implement", "references");
const readRef = (...p) => readFileSync(join(REFS, ...p), "utf8");
const LITE_MODE_PATH = join(REFS, "lite-mode.md");
const lite = existsSync(LITE_MODE_PATH) ? readFileSync(LITE_MODE_PATH, "utf8") : "";
const loop = readRef("steps", "step-2-per-task-loop.md");

/** The text under the first heading line starting with `prefix`, up to the next heading of level 2-4. */
function subsection(text, prefix) {
  const m = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$`, "m").exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^#{2,4} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

test("Step 2 summary points at lite-mode.md with an <ADEV_ROOT> anchor", () => {
  const step2 = section(body, "### Step 2: Per-Task Execution Loop");
  assert.ok(step2 !== null, "missing `### Step 2: Per-Task Execution Loop`");
  assert.match(
    step2,
    /> \*\*Conditional loading:\*\* Read `<ADEV_ROOT>\/skills\/implement\/references\/lite-mode\.md`/,
  );
  assert.match(step2, /when any task resolves `lite`/i);
});

test("the body intro no longer claims every task gets a fresh subagent", () => {
  const intro = body.slice(body.indexOf("# Implement Plan"), body.indexOf("### Dispatch Turn Discipline"));
  assert.match(intro, /inline/);
  assert.match(intro, /`lite`/);
});

test("lite-mode.md exists", () => {
  assert.ok(existsSync(LITE_MODE_PATH), "skills/implement/references/lite-mode.md is missing");
});

test("lite-mode passes run_base to resolve-depth on both passes", () => {
  assert.match(lite, /resolve-depth[^\n]*--run-base <run_base>[^\n]*--pass provisional|--pass provisional[^\n]*--run-base <run_base>/);
  assert.match(lite, /--pass final --run-base <run_base> --base-sha/);
});

test("lite-mode: no Agent dispatch, agent-default mandate, test-integrity, one commit, no Review-round trailer", () => {
  for (const re of [
    /no `Agent` dispatch/i,
    /<ADEV_ROOT>\/skills\/implement\/references\/agent-default-mandate\.md/,
    /<ADEV_ROOT>\/skills\/implement\/references\/test-integrity\.md/,
    /Spec:/,
    /Plan-task:/,
    /no `Review-round:` trailer/i,
    /no `adev test-policy resolve`/i,
    /no `test_depth_assigned`/i,
  ]) assert.match(lite, re);
});

test("lite-mode order: in_progress event, then snapshot-base, then implement", () => {
  const a = lite.indexOf("in_progress");
  const b = lite.indexOf("adev implement snapshot-base");
  const c = lite.indexOf("agent-default-mandate.md");
  assert.ok(a > 0 && a < b, "the `plan_task` `in_progress` event must precede `adev implement snapshot-base`");
  assert.ok(b < c, "the snapshot must be taken before the task is implemented");
});

test("the tripwire always runs for a lite task, whatever flags the final call carries", () => {
  assert.match(lite, /keyed on the task's provisional `lite` resolution/i);
});

test("lite-mode: still-lite ends with the 2h gates, one commit, then plan_task done; escalation joins 2f-pre", () => {
  const trip = subsection(lite, "## 3.");
  assert.ok(trip, "lite-mode.md must have a numbered `## 3.` tripwire section");
  const gates = trip.indexOf("2h");
  const commit = trip.indexOf("one commit");
  const done = trip.indexOf("`done`");
  assert.ok(gates > 0 && gates < commit && commit < done, "gates, then commit, then `plan_task` `done`");
  assert.match(trip, /2f-pre/);
  assert.match(trip, /`quick`[^\n]*synthesized reviewer/);
  assert.match(trip, /`full`[^\n]*(both stages|Stage 1)/);
});

// The escalated task was implemented under agent-default; a reviewer told the
// project's mode (e.g. tdd) would demand test-first evidence that cannot exist.
test("an escalated lite task is reviewed and fixed under the agent-default mandate", () => {
  const trip = subsection(lite, "## 3.");
  assert.ok(trip, "lite-mode.md must have a numbered `## 3.` tripwire section");
  const escalated = trip.slice(trip.indexOf("**Escalated.**"));
  assert.match(escalated, /`Implementation mode: agent-default`/);
  assert.match(escalated, /fix pass(es)?[^.]*agent-default|agent-default[^.]*fix pass/i);
});

test("2g's reviewer is told agent-default for a task escalated from lite", () => {
  const s2 = subsection(loop, "#### 2g. Stage 2 Review");
  assert.ok(s2, "missing `#### 2g. Stage 2 Review`");
  assert.match(
    s2,
    /`Implementation mode: <mode>` \(resolved in Step 1; `agent-default` for a task escalated from `lite` — see `lite-mode\.md` §3\)/,
  );
});

test("2f-pre: an escalated lite task enters at the depth branch with no second final pass", () => {
  const pre = subsection(loop, "#### 2f-pre.");
  assert.match(pre, /escalated `lite` task[^.]*(enters|joins)[^.]*branch/i);
  assert.match(pre, /not run (a second|another) final pass|no second final pass/i);
});

test("Step 2 opens with the plan-order rule, not dependency order", () => {
  const opening = loop.split("\n").slice(0, 4).join("\n");
  assert.doesNotMatch(opening, /dependency order/);
  assert.match(opening, /plan order/);
});

test("parallel group prompt forwards the operator's --tier to resolve-depth", () => {
  assert.match(readRef("parallel-mode.md"), /--run-base <run_base> --parallel \[--tier <t>\][^;]*as the operator passed it/);
});

test("visibility relays (WR-7)", () => {
  assert.match(lite, /lite authorized via/);
  assert.match(lite, /lite_denied/);
  assert.match(lite, /LITE_TRIPWIRE_ESCALATED/);
  assert.match(lite, /other than `not-authorized`/);
});

test("lite-mode names the routing sidecar that must be committed at run_base", () => {
  assert.match(lite, /ROUTING_SIDECAR_MISSING/);
  assert.match(lite, /routing-scores/);
  assert.match(lite, /commit[^\n]*routing\.json|routing\.json[^\n]*commit/i);
  assert.match(lite, /\/adev:route/);
});

test("hard-gate list (BEH-14) names every gate", () => {
  const gates = subsection(lite, "## 8.");
  assert.ok(gates, "lite-mode.md must have a numbered `## 8.` hard-gate section");
  for (const g of ["gate_mode", "adev gate require", "main", "skill extensions", "test-integrity.md", "fail-fast", "destructive", "constitution"])
    assert.match(gates, new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), g);
});

test("lite-mode: the escalated-task halt is the Step 2g halt, unchanged by --lite (BEH-15)", () => {
  const halt = subsection(lite, "## 7.");
  assert.ok(halt, "lite-mode.md must have a numbered `## 7.` halt section");
  assert.match(halt, /Step 2g/);
  assert.match(halt, /`--lite` changes nothing/);
  assert.match(halt, /never waits for input/i);
});

test("mixed plans run in plan order; consecutive lite tasks run inline", () => {
  assert.match(lite, /plan order/);
  assert.match(lite, /Consecutive `lite` tasks run inline/);
  assert.match(lite, /reason `lite`/);
});

test("lite-mode points at the end-of-run references", () => {
  assert.match(lite, /<ADEV_ROOT>\/skills\/implement\/references\/integration-gate\.md/);
  assert.match(lite, /<ADEV_ROOT>\/skills\/implement\/references\/steps\/step-3-final-review\.md/);
});

test("lite-mode never tells the agent to choose lite itself (BEH-13)", () => {
  // Any line that has the agent add, pass, repeat or forward the flag must tie it to the operator.
  const directive = /\b(add|pass|repeat|forward|use|choose|select)\b[^\n]*(--lite|--tier lite)/i;
  const lines = lite.split("\n").filter((l) => directive.test(l));
  assert.ok(lines.length > 0, "lite-mode.md must say how the lite flags are passed on");
  for (const line of lines)
    assert.match(line, /operator|never add/i, `line does not tie --lite to operator input: ${line}`);
});

test("Stage 1 cap routes to the Step 2g halt, never to the user (WR-8)", () => {
  const s1 = subsection(loop, "#### 2f. Stage 1 Review");
  assert.ok(s1, "missing `#### 2f. Stage 1 Review`");
  assert.doesNotMatch(s1, /escalate to the user/i);
  assert.match(s1, /plan_task` `blocked`/);
  assert.match(s1, /LOOP_BUDGET_EXHAUSTED/);
  assert.match(s1, /status: "blocked"/);
  assert.match(s1, /never waits for input/i);
  assert.match(s1, /spec-compliance review did not converge/);
});

test("the 2g halt applies to every run and is a build step's STEP_RESULT BLOCKED", () => {
  const s2 = subsection(loop, "#### 2g. Stage 2 Review");
  assert.ok(s2, "missing `#### 2g. Stage 2 Review`");
  assert.match(s2, /interactive, headless, scheduled/i);
  assert.match(s2, /status: BLOCKED/);
});

test("Step 2 no longer passes --in-batch and passes --run-base", () => {
  assert.doesNotMatch(loop, /--in-batch/);
  assert.match(
    loop,
    /resolve-depth[^\n]*--run-base <run_base> \[--tier <t>\] \[--lite\] \[--parallel\] \[--review-cycles <n>\] --pass provisional/,
  );
});

test("on depth lite, Step 2 follows lite-mode.md instead of 2b-2g", () => {
  assert.match(loop, /`depth: lite`[^\n]*<ADEV_ROOT>\/skills\/implement\/references\/lite-mode\.md[^\n]*instead of 2b/);
});

test("2f-pre passes --run-base on the final pass and echoes LITE_TRIPWIRE_ESCALATED", () => {
  const pre = subsection(loop, "#### 2f-pre.");
  assert.ok(pre, "missing `#### 2f-pre.`");
  assert.match(pre, /--run-base <run_base>/);
  assert.match(pre, /LITE_TRIPWIRE_ESCALATED/);
});

test("batches call passes --run-base and forwards only operator-typed --lite", () => {
  assert.match(loop, /adev implement batches --plan <plan-path> --run-base <run_base> \[--lite\]/);
  assert.match(loop, /Pass `--lite` only when the operator typed it/);
});

test("one task-id spelling: the bare plan number", () => {
  assert.match(loop, /bare plan number `<n>`/);
  assert.match(loop, /`t<n>`/);
});

test("no resolve-depth or batches invocation under skills/implement passes --in-batch or omits --run-base", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".md")) files.push(join(dir, e.name));
    }
  };
  walk(join(PLUGIN_ROOT, "skills", "implement"));
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /--in-batch/, `${f} still passes --in-batch`);
    // An invocation (with any `\`-continued lines) must carry --run-base.
    const calls = text.match(/adev implement (?:resolve-depth|batches) --(?:\\\n|[^`\n])*/g) ?? [];
    for (const c of calls) assert.match(c, /--run-base/, `${f}: invocation without --run-base: ${c}`);
  }
});

test("failure table gains QUALITY_GATES_FAILED beside Prerequisites 6; the do-not-double-emit line is unchanged", () => {
  const f = readRef("failure-path-exit-event.md");
  assert.match(f, /^\| Prerequisites 6 \|/m);
  assert.match(f, /^\| Step 2-post \|[^\n]*QUALITY_GATES_FAILED/m);
  assert.ok(f.includes(
    "**Already covered — do not double-emit.** Per-task escalations route through the Step 2d blocker path (`plan_task` `blocked` event plus execution state with `status: \"blocked\"`), which is the terminal the framework already records for them.",
  ));
});

test("batched, parallel and Step 2 references no longer promise a fixed 2-stage review", () => {
  for (const p of ["batched-mode.md", "parallel-mode.md"])
    assert.doesNotMatch(readRef(p), /2-stage review/, p);
  assert.doesNotMatch(loop, /2-stage review/);
});
