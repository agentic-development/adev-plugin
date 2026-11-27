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
  assert.match(step2, /when `check-flags` printed `lite_authorized: true`/);
});

// BEH-17: a lite-authorized run reads lite-mode.md first and pays for the
// 40 KB per-task loop only when a task actually needs a reviewer.
test("Step 2 loads step-2-per-task-loop.md only for a quick or full task when lite is authorized (BEH-17)", () => {
  const step2 = section(body, "### Step 2: Per-Task Execution Loop");
  const liteIdx = step2.indexOf("references/lite-mode.md");
  const loopIdx = step2.indexOf("references/steps/step-2-per-task-loop.md");
  assert.ok(liteIdx > 0 && loopIdx > 0, "both pointers stay in Step 2");
  assert.match(step2, /Read `<ADEV_ROOT>\/skills\/implement\/references\/lite-mode\.md` first when `check-flags` printed `lite_authorized: true`/);
  assert.match(step2, /`adev implement task-begin`/);
  assert.match(
    step2,
    /`<ADEV_ROOT>\/skills\/implement\/references\/steps\/step-2-per-task-loop\.md`[^\n]*only when a task first resolves `quick` or `full` or escalates/,
  );
  assert.match(step2, /not authorized[^\n]*every task/i);
});

test("the body intro no longer claims every task gets a fresh subagent", () => {
  const intro = body.slice(body.indexOf("# Implement Plan"), body.indexOf("### Dispatch Turn Discipline"));
  assert.match(intro, /inline/);
  assert.match(intro, /`lite`/);
});

test("lite-mode.md exists", () => {
  assert.ok(existsSync(LITE_MODE_PATH), "skills/implement/references/lite-mode.md is missing");
});

test("lite-mode passes run_base to task-begin and to the final pass", () => {
  assert.match(lite, /adev implement task-begin[^\n]*--run-base <run_base>/);
  assert.match(lite, /--pass final --run-base <run_base> --base-sha/);
});

test("lite-mode: no Agent dispatch, agent-default mandate, test-integrity, one commit, no Review-round trailer", () => {
  for (const re of [
    /no `Agent` dispatch/i,
    /`agent-default`/,
    /`test-integrity\.md`/,
    /Spec:/,
    /Plan-task:/,
    /no `Review-round:` trailer/i,
    /no `adev test-policy resolve`/i,
    /no `test_depth_assigned`/i,
  ]) assert.match(lite, re);
});

// BEH-17: lite-mode.md is self-contained for an inline task, so the mandate and
// the test-integrity rules it needs are stated in it, not behind more reads.
test("lite-mode states the agent-default mandate inline (BEH-6, BEH-17)", () => {
  const mandate = subsection(lite, "### The `agent-default` mandate");
  assert.ok(mandate, "lite-mode.md must carry a `### The `agent-default` mandate` subsection");
  assert.match(mandate, /no test requirement and no test order/);
  assert.match(mandate, /whatever `implementation_mode` the project sets/);
  assert.match(mandate, /[Rr]un the tests relevant to what you changed/);
  assert.match(mandate, /which tests you added or changed, or why you added none/);
  assert.doesNotMatch(lite, /Read `<ADEV_ROOT>\/skills\/implement\/references\/agent-default-mandate\.md`/);
});

test("lite-mode states the test-integrity rules inline (BEH-6, BEH-14, BEH-17)", () => {
  const rules = subsection(lite, "### Test integrity");
  assert.ok(rules, "lite-mode.md must carry a `### Test integrity` subsection");
  for (const re of [
    /[Ii]nvestigate first/,
    /acceptance criteria/,
    /[Nn]ever loosen a matcher/,
    /[Nn]o conditional skips/,
    /cannot fail is not a test/,
    /[Ff]ix the app, not the test/,
    /[Ss]eed before you assert/,
  ]) assert.match(rules, re);
});

test("lite-mode starts each inline task with adev implement task-begin, never separate bookkeeping calls (BEH-17)", () => {
  const loopSection = subsection(lite, "## 2.");
  assert.ok(loopSection, "lite-mode.md must have a numbered `## 2.` inline-loop section");
  assert.ok(loopSection.includes("adev implement task-begin"), "the inline loop starts with `adev implement task-begin`");
  const begin = lite.indexOf("adev implement task-begin");
  assert.ok(begin < lite.indexOf("### The `agent-default` mandate"), "task-begin precedes the implementation");
  assert.ok(begin < lite.indexOf("--pass final"), "task-begin precedes the tripwire");
  assert.match(loopSection, /`plan_task` `in_progress`/);
  assert.match(loopSection, /`snapshot`/);
  assert.match(loopSection, /`execution_state`/);
  assert.match(loopSection, /TASK_BEGIN_FAILED/);
  assert.doesNotMatch(lite, /adev implement snapshot-base/);
  assert.doesNotMatch(lite, /adev execution-state write/);
  assert.doesNotMatch(lite, /--status in_progress/);
});

// The batches call is the run's one batch-forming call, so it must forward the
// same operator overrides Step 2 does, and a later read of the loop must not
// form the batches a second time.
test("lite-mode's batches call carries --max-batch and --no-batch as the operator passed them, and runs once", () => {
  const ordering = subsection(lite, "## 4.");
  assert.ok(ordering, "lite-mode.md must have a numbered `## 4.` ordering section");
  assert.match(
    ordering,
    /`adev implement batches --plan <plan-path> --run-base <run_base> \[--lite\] \[--tier <t>\] \[--max-batch <n>\] \[--no-batch\]`/,
  );
  assert.match(ordering, /`--max-batch` and `--no-batch`[^.]*operator/);
  assert.match(ordering, /do not run (it|`batches`) again/i);
  const preamble = loop.slice(0, loop.indexOf("#### 2.pre"));
  assert.match(preamble, /already ran[^.]*this invocation[^.]*do not run it again/i);
});

// A task the probe finds already implemented must still reach `done`, or it
// stays `in_progress` from its task-begin forever.
test("lite-mode states both implementation-probe outcomes inline (Step 2.pre)", () => {
  const loopSection = subsection(lite, "## 2.");
  assert.match(
    loopSection,
    /adev report --type plan-task --spec <spec> --plan <plan> --task-id <n> --status done --notes "Already implemented \(detected by implementation probe\)"/,
  );
  assert.match(loopSection, /then run the next task's `task-begin`/);
  assert.match(loopSection, /[Oo]therwise[^.]*implement/);
});

test("lite-mode says how to recover a failed chain without a second commit", () => {
  const trip = subsection(lite, "## 3.");
  assert.match(trip, /hook rejects the commit[^.]*fix[^.]*re-run the whole chain/i);
  assert.match(trip, /fails after the commit[^.]*only the remaining steps[^.]*never commit again/i);
});

test("lite-mode loads test-integrity.md exactly when a test is changed or fails unexpectedly", () => {
  const rules = subsection(lite, "### Test integrity");
  assert.match(
    rules,
    /Read `<ADEV_ROOT>\/skills\/implement\/references\/test-integrity\.md` before changing any test, or when a test fails unexpectedly/,
  );
});

test("lite-mode's commit template carries Step 5.5's Session trailer", () => {
  assert.match(lite, /git commit [^\n]*--trailer "Spec: <spec>" --trailer "Plan-task: <n>" --trailer "Session: <session>"/);
});

test("lite-mode chains commit, plan_task done and the next task-begin, commit first (BEH-17)", () => {
  const chain = /git commit [^\n]*&& adev report --type plan-task [^\n]*--status done [^\n]*&& adev implement task-begin [^\n]*--task-id <next>/;
  assert.match(lite, chain);
  const trip = subsection(lite, "## 3.");
  const gates = trip.indexOf("2h");
  const checkpoint = trip.indexOf("assisted-agent");
  const chained = trip.search(/git commit [^\n]*&& adev report/);
  assert.ok(gates > 0 && checkpoint > 0 && chained > Math.max(gates, checkpoint), "the gates and the checkpoint come before the chain");
  assert.match(trip, /never inside the chain/i);
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
  assert.match(lite, /no-routing-entry/);
  assert.doesNotMatch(lite, /routing-scores/);
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

// BEH-4: authorization is evaluated on each pass from the same inputs, so a
// final pass without the operator's flag would drop the lite cap.
test("2f-pre's final pass repeats the operator's --lite and --tier (BEH-4)", () => {
  const pre = subsection(loop, "#### 2f-pre.");
  assert.match(pre, /--pass final[^\n]*\[--tier <t>\] \[--lite\]|\[--tier <t>\] \[--lite\][^\n]*--pass final/);
  assert.match(pre, /`--lite` and `--tier` exactly as the operator passed them/);
});

test("2a: with lite authorized the provisional call is task-begin, and 2b does not repeat it (BEH-17)", () => {
  const prov = paragraph(loop, "Provisional review depth.");
  assert.match(prov, /`lite_authorized: true`[^.]*`adev implement task-begin`/);
  assert.match(prov, /do not (repeat|run) the provisional `resolve-depth` call/i);
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
    const calls = text.match(/adev implement (?:resolve-depth|batches|task-begin) --(?:\\\n|[^`\n])*/g) ?? [];
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

const SKILL_DIR = join(PLUGIN_ROOT, "skills", "implement");
const depthContract = readFileSync(join(SKILL_DIR, "graduated-review-depth.md"), "utf8");
const batched = readRef("batched-mode.md");
const integrationGate = readRef("integration-gate.md");
const finalReview = readRef("steps", "step-3-final-review.md");

test("depth contract describes the ladder", () => {
  for (const s of ["default-quick", "lite-grant", "lite-tripwire", "lite_denied", "lite_source", "routing"])
    assert.ok(depthContract.includes(s), s);
  assert.doesNotMatch(depthContract, /predicate-grant/);
  assert.match(depthContract, /`batched-task` and `scope-mismatch` are no longer floor legs/);
});

test("depth contract: quick is the baseline, every floor leg is named, full is no longer the default", () => {
  assert.match(depthContract, /`quick` is the baseline/);
  for (const leg of ["risk-level", "routing", "boundary", "sensitive-path", "critical-finding"])
    assert.match(depthContract, new RegExp(`\\| \`${leg}\` \\|`), `floor-leg table row for ${leg}`);
  assert.match(depthContract, /`human-only`/);
  assert.doesNotMatch(depthContract, /`full` \(default/);
  assert.doesNotMatch(depthContract, /nothing in this file modifies it/);
  for (const s of ["tier-full-absolute", "policy-baseline"]) assert.ok(depthContract.includes(s), s);
});

test("depth contract: lite grant conditions, tripwire bound and LITE_TRIPWIRE_ESCALATED echo", () => {
  assert.match(depthContract, /lite-mode\.md/);
  assert.match(depthContract, /LITE_TRIPWIRE_ESCALATED/);
  assert.match(depthContract, /`scope-mismatch`[^\n]*`quick`/);
  assert.match(depthContract, /`not-authorized`/);
  assert.match(depthContract, /provisional pass/);
});

test("depth contract: quick reviewer context carries the implementation mode, agent-default for an escalated lite task", () => {
  const quick = subsection(depthContract, "### `quick`");
  assert.ok(quick, "missing `### \\`quick\\`` branch");
  assert.match(
    quick,
    /^- `Implementation mode: <mode>`[^\n]*`agent-default` for a task escalated from `lite`/m,
  );
});

test("Step 2's Required reading anchor still resolves to the depth contract", () => {
  const m = /> \*\*Required reading:\*\* `([^`]+)`/.exec(loop);
  assert.ok(m, "step-2-per-task-loop.md lost its Required reading anchor");
  assert.ok(existsSync(join(PLUGIN_ROOT, m[1])), `${m[1]} does not exist`);
  assert.match(m[1], /graduated-review-depth\.md$/);
});

test("batched-mode: a batched task is reviewed at its own resolved depth; lite never batches", () => {
  assert.match(batched, /at the task's resolved review depth/);
  assert.match(batched, /`lite` tasks are never batched/);
  assert.doesNotMatch(batched, /at unchanged depth/);
  assert.doesNotMatch(batched, /both review stages per task/i);
  assert.doesNotMatch(batched, /both reviews/i);
});

test("batched-mode: lite members split a group into segments, dispatched interleaved in plan order", () => {
  assert.match(batched, /`segment`/);
  assert.match(batched, /more than one batch/);
  assert.match(batched, /reason `lite`/);
  assert.match(batched, /reason `lite-assumed`/);
  assert.match(batched, /LITE_AUTHORIZATION_ASSUMED/);
  assert.match(batched, /interleaved in plan order/);
  assert.match(batched, /first member comes up/);
});

test("task-transitions: done follows the review the resolved depth requires", () => {
  const t = readRef("task-transitions.md");
  assert.doesNotMatch(t, /both reviews/i);
  assert.match(t, /resolved (review )?depth/);
});

test("integration gate: whole-run quality gates once after any lite task, QUALITY_GATES_FAILED, --verdict FAIL", () => {
  const g = integrationGate;
  assert.match(g, /QUALITY_GATES_FAILED/);
  assert.match(g, /--status failed --verdict FAIL/);
  assert.match(g, /any task in the run resolved `lite`/);
});

test("integration gate: the lite pass runs even when no post-implement gate is selected, fail-fast, once", () => {
  const g = integrationGate;
  assert.match(g, /even when no `post-implement` gate is selected/);
  assert.match(g, /fail-fast/i);
  assert.match(g, /Quality Gates/);
  // The silent skip must carve out the lite pass, or an all-lite run with no
  // post-implement gate would end with no gate run at all.
  assert.match(g, /skip this step silently[^\n]*unless[^\n]*`lite`/);
  assert.match(g, /failure-path-exit-event\.md/);
});

test("Step 3 skipped only when every task resolved lite", () => {
  assert.match(finalReview, /only when every task in the run resolved `lite`/);
  assert.match(finalReview, /otherwise it runs/i);
});

test("failure table gains QUALITY_GATES_FAILED; the do-not-double-emit line is unchanged (CON-1)", () => {
  const f = readRef("failure-path-exit-event.md");
  assert.match(f, /QUALITY_GATES_FAILED/);
  assert.ok(f.includes(
    "**Already covered — do not double-emit.** Per-task escalations route through the Step 2d blocker path (`plan_task` `blocked` event plus execution state with `status: \"blocked\"`), which is the terminal the framework already records for them. That path covers the subagent blocker-flag protocol, `MISSING_DEPTH_ASSIGNMENT` from `adev test-policy assert-assigned`, and the Stage-2 convergence terminals `LOOP_BUDGET_EXHAUSTED` / `LOOP_NO_PROGRESS` / `LOOP_REGRESSED`. Emit the step-level `--status failed` event only when the *whole skill* stops, not once per blocked task.",
  ));
});

/** The bold-labelled paragraph starting `**<label>**`, up to the next blank line. */
function paragraph(text, label) {
  const start = text.indexOf(`**${label}**`);
  if (start === -1) return null;
  const end = text.indexOf("\n\n", start);
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

// ROUTING_SIDECAR_MISSING comes from the run-base read, which both passes
// make. The grant reads no routing scores, so no pass raises a score warning
// and no echo rule may name one.
test("depth contract: warnings are echoed on the pass that emits them (BEH-5, BEH-7)", () => {
  const prov = paragraph(depthContract, "Warning visibility, provisional pass.");
  const fin = paragraph(depthContract, "Warning visibility, final pass.");
  assert.ok(prov, "missing the provisional-pass warning-visibility paragraph");
  assert.ok(fin, "missing the final-pass warning-visibility paragraph");
  for (const code of ["ROUTING_SIDECAR_MISSING", "REVIEW_DEPTH_FLOOR_APPLIED"])
    assert.match(prov, new RegExp(code), `provisional: ${code}`);
  for (const code of ["REVIEW_DEPTH_FLOOR_APPLIED", "LITE_TRIPWIRE_ESCALATED", "ROUTING_SIDECAR_MISSING"])
    assert.match(fin, new RegExp(code), `final: ${code}`);
  assert.doesNotMatch(depthContract, /ROUTING_SCORE_OUT_OF_RANGE/);
  assert.match(prov, /operator-facing transcript/);
  assert.match(fin, /operator-facing transcript/);
});

test("depth contract: an uncommitted sidecar denies the grant with no-routing-entry (BEH-5)", () => {
  assert.match(
    depthContract,
    /routing sidecar not committed at `run_base` denies with `no-routing-entry` and a `ROUTING_SIDECAR_MISSING` warning/,
  );
  assert.doesNotMatch(depthContract, /routing-scores/);
});

test("depth contract: the grant reads no scores, and the lite cap gives quick with floor_cap (BEH-4, BEH-5)", () => {
  assert.match(depthContract, /routed `auto-agent` or\s+`assisted-agent`\. Routing scores are not consulted\./);
  assert.match(depthContract, /a `human-only` entry with `floor:routing`/);
  const cap = paragraph(depthContract, "The lite cap.");
  assert.ok(cap, "missing the **The lite cap.** paragraph");
  assert.match(cap, /`boundary` or `sensitive-path`[\s\S]*gives `quick`/);
  assert.match(cap, /floor_cap: "quick"/);
  assert.match(cap, /`routing`,\s+`critical-finding`\) gives `full`/);
  assert.match(cap, /`--tier full` stays absolute/);
});

// Every place the depth contract describes what a floor leg gives must carry
// the lite cap, or a reader of that section alone applies the uncapped rule.
test("depth contract: the ladder summary, the floor-leg table and the tripwire all state the lite cap (BEH-4, BEH-7)", () => {
  const step3 = depthContract.split("\n").find((line) => line.startsWith("3. **Floor.**"));
  assert.ok(step3, "missing the ladder's Floor step");
  const floorStep = depthContract.slice(depthContract.indexOf(step3), depthContract.indexOf("4. **`lite` grant.**"));
  assert.match(floorStep, /lite cap/);
  assert.match(floorStep, /`quick`/);

  const legs = subsection(depthContract, "## 2. Floor legs");
  assert.ok(legs, "missing section 2");
  assert.match(legs.split("| Leg |")[0], /lite cap[\s\S]*`boundary`\s+and `sensitive-path` give `quick`/);

  const trip = paragraph(depthContract, "The `lite` tripwire.");
  assert.ok(trip, "missing the **The `lite` tripwire.** paragraph");
  const tripSection = depthContract.slice(depthContract.indexOf("**The `lite` tripwire.**"), depthContract.indexOf("## 6."));
  assert.doesNotMatch(tripSection, /at most two levels/);
  assert.doesNotMatch(tripSection, /any floor leg gives `full`/);
  assert.match(tripSection, /`sensitive-path` or `boundary` leg gives `quick` with `floor_cap: "quick"`/);
  assert.match(tripSection, /only a `routing` or `critical-finding` leg gives `full`/);

  const full = subsection(depthContract, "### `full`");
  assert.doesNotMatch(full, /tripwire escalation on a sensitive or boundary path/);
  assert.doesNotMatch(depthContract, /Routing scores and the shape of the task's file set never deny `quick`/);
});

test("Step 2a's provisional call echoes its warnings to the transcript (BEH-5)", () => {
  const prov = paragraph(loop, "Provisional review depth.");
  assert.ok(prov, "missing the **Provisional review depth.** paragraph");
  for (const code of ["ROUTING_SIDECAR_MISSING", "REVIEW_DEPTH_FLOOR_APPLIED"])
    assert.match(prov, new RegExp(code), code);
  assert.doesNotMatch(prov, /ROUTING_SCORE_OUT_OF_RANGE/);
  assert.match(prov, /operator-facing transcript/);
});

test("2f-pre echoes the final pass's warnings and names no score warning (BEH-7)", () => {
  const pre = subsection(loop, "#### 2f-pre.");
  assert.match(pre, /REVIEW_DEPTH_FLOOR_APPLIED/);
  assert.match(pre, /ROUTING_SIDECAR_MISSING/);
  assert.doesNotMatch(pre, /ROUTING_SCORE_OUT_OF_RANGE/);
});

// BEH-17: lite-mode.md cites the verb for the grant and floor rules instead of
// restating them, so the resolver stays their single statement.
test("lite-mode cites resolve-depth for the grant and the lite cap, and keeps the quick-only tripwire for sensitive and boundary paths (BEH-4, BEH-7, BEH-17)", () => {
  assert.match(lite, /grant and floor rules[^.]*`adev implement resolve-depth`/);
  assert.match(lite, /<ADEV_ROOT>\/skills\/implement\/graduated-review-depth\.md/);
  assert.doesNotMatch(lite, /no score below the threshold/);
  assert.doesNotMatch(lite, /\(scores are not consulted\)/);
  assert.match(lite, /`floor_cap: "quick"`/);
  const trip = subsection(lite, "## 3.");
  assert.match(trip, /a touched `sensitive-path` or `boundary` path escalates the task to `quick`/);
  assert.match(trip, /assisted-agent`, present the diff/);
});

// lite-mode.md loads only after a task resolves lite, which an uncommitted
// sidecar prevents, so the relay for that case must live in Step 2a.
test("lite-mode defers the uncommitted-sidecar relay to Step 2a and echoes the tripwire's warnings (BEH-5, BEH-7)", () => {
  const sidecar = paragraph(lite, "The routing sidecar must be committed at `run_base`.");
  assert.ok(sidecar, "missing the routing-sidecar paragraph");
  assert.match(sidecar, /Step 2a/);
  assert.match(sidecar, /graduated-review-depth\.md/);
  const trip = subsection(lite, "## 3.");
  assert.doesNotMatch(trip, /ROUTING_SCORE_OUT_OF_RANGE/);
  assert.match(trip, /ROUTING_SIDECAR_MISSING/);
  assert.match(trip, /graduated-review-depth\.md/);
});

test("a scope-mismatch escalation is echoed as LITE_TRIPWIRE_ESCALATED, never as a floor (BEH-7)", () => {
  const rule = /[Nn]ever announce a `scope-mismatch` escalation as `REVIEW_DEPTH_FLOOR_APPLIED`/;
  assert.match(depthContract, rule);
  assert.match(subsection(lite, "## 3."), rule);
  assert.doesNotMatch(depthContract, /`floor_applied` is\s+`true`, echo/);
});

test("depth contract: §2 and §5 summaries match the resolver (BEH-4, BEH-7)", () => {
  const floor = subsection(depthContract, "## 2.");
  assert.ok(floor, "missing `## 2.`");
  assert.match(floor, /declared and touched paths together/);
  assert.match(floor, /gitignored/);
  const fin = subsection(depthContract, "## 5.");
  assert.ok(fin, "missing `## 5.`");
  assert.match(fin, /`risk-level`, `routing` and `critical-finding`/);
  assert.match(fin, /gitignored paths\s+written since[^.]*`in_progress`/);
  assert.match(fin, /anywhere in the tree/);
  assert.match(fin, /`\*\.spec\.md` is never exempt/);
});

test("integration gate: a warning-severity failure still runs the whole-run pass before Step 3 (BEH-9)", () => {
  const warn = paragraph(integrationGate, "If a gate exits non-zero with `severity: warning`:");
  assert.ok(warn, "missing the severity: warning branch");
  assert.match(warn, /Run the whole-run quality-gate pass below when it applies, then proceed to Step 3/);
  const pass = paragraph(integrationGate, "If every executed gate passes:");
  assert.match(pass, /Run the whole-run quality-gate pass below when it applies, then proceed to Step 3/);
});

test("Step 2-post body pointer: --task skip unless the task stayed lite through its tripwire (BEH-9)", () => {
  assert.match(body, /skip under `--task <N>` unless that task stayed `lite` through its tripwire/);
});

// The run-base read repeats ROUTING_SIDECAR_MISSING on every resolve-depth and
// batches call, whether or not lite is authorized, so an unqualified "echo it"
// either spams every task or announces a lite problem on a run that never asked
// for lite. One relay point per invocation, gated on authorization.
const SIDECAR_RELAY = [
  /only when `check-flags` printed `lite_authorized: true`/,
  /first provisional `resolve-depth` call of this invocation/,
  /`batches` advisory/,
  /whichever comes first/,
];

test("ROUTING_SIDECAR_MISSING has one relay point, gated on lite authorization (BEH-5)", () => {
  const prov = paragraph(depthContract, "Warning visibility, provisional pass.");
  const step2a = paragraph(loop, "Provisional review depth.");
  const sidecar = paragraph(lite, "The routing sidecar must be committed at `run_base`.");
  for (const [name, text] of [["contract §3", prov], ["Step 2a", step2a], ["lite-mode", sidecar], ["batched-mode", batched]]) {
    assert.ok(text, `${name}: missing text`);
    for (const re of SIDECAR_RELAY) assert.match(text, re, `${name}: ${re}`);
  }
  assert.match(prov, /do not echo it again/i);
  assert.match(prov, /batch agent never relays it/i);
  assert.match(batched, /relay point/);
  assert.match(batched, /batch agent never relays it/i);
});

test("the final pass never relays ROUTING_SIDECAR_MISSING (BEH-5)", () => {
  const fin = paragraph(depthContract, "Warning visibility, final pass.");
  assert.match(fin, /`ROUTING_SIDECAR_MISSING`[^.]*do not echo it/i);
  assert.doesNotMatch(fin, /when the provisional pass has not already relayed it/);
  const pre = subsection(loop, "#### 2f-pre.");
  assert.match(pre, /`ROUTING_SIDECAR_MISSING`[^.]*do not echo it/i);
});

test("depth contract: the tripwire section number and the empty-segment exemption rule are right (BEH-7)", () => {
  assert.doesNotMatch(depthContract, /\(section 4\)/);
  assert.match(depthContract, /\(section 5\)/);
  assert.match(subsection(depthContract, "## 5."), /a path with an empty, `\.` or `\.\.` segment/);
});

test("no implement skill text tells the agent to choose lite (BEH-13)", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".md")) files.push(join(dir, e.name));
    }
  };
  walk(SKILL_DIR);
  const flag = /--lite\b|--tier lite\b/;
  const directive = /\b(add|adds|pass|passes|use|uses|choose|select|forward|repeat|append|include|set)\b/i;
  let seen = 0;
  for (const f of files) {
    let fenced = false;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
      if (!flag.test(line)) continue;
      seen++;
      // A fenced invocation synopsis lists the flag as an optional argument; the
      // prose around it states who supplies it.
      if (fenced && !flag.test(line.replace(/\[--lite\]/g, ""))) continue;
      const argumentDefinition = /^- `--(lite|tier <)/.test(line);
      const operatorRule = /operator/i.test(line);
      const noSelfSelection = /never add/i.test(line);
      const nonDirective = !directive.test(line);
      assert.ok(
        argumentDefinition || operatorRule || noSelfSelection || nonDirective,
        `${f}: line does not tie the lite flag to operator input: ${line}`,
      );
    }
  }
  assert.ok(seen > 0, "the scan must see the lite flags");
});
