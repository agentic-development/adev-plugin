import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, resolveSkillPointer } from "../helpers.mjs";

const SKILL = join(PLUGIN_ROOT, "skills/review-specs/SKILL.md");
const STEPS = join(PLUGIN_ROOT, "skills/review-specs/references/steps");
const skill = readFileSync(SKILL, "utf8");
const step5 = readFileSync(join(STEPS, "step-5-consolidate-findings.md"), "utf8");
const step6 = readFileSync(join(STEPS, "step-6-events-and-report.md"), "utf8");
const POINTER = "<ADEV_ROOT>/skills/review-specs/references/steps/step-8-decision-ask-round.md";

function askRound() {
  return readFileSync(resolveSkillPointer(POINTER), "utf8");
}

test("step-5 reference writes decisionsRequiredTable verbatim under ## Decisions Required and never assembles rows", () => {
  assert.match(step5, /## Decisions Required/);
  assert.match(step5, /decisionsRequiredTable/);
  assert.match(step5, /verbatim/i);
  assert.match(step5, /never (assemble|build|render)[^.]*rows/i);
});

test("step-6 reference passes question and options through unmodified and never answer keys", () => {
  assert.match(step6, /`question`[^.]*`options`/);
  assert.match(step6, /decision_choice/);
  assert.match(step6, /decision_note/);
  assert.match(step6, /decision_recorded/);
});

test("SKILL.md allowed-tools includes AskUserQuestion", () => {
  const line = skill.split("\n").find((l) => l.startsWith("allowed-tools:"));
  assert.match(line, /\bAskUserQuestion\b/);
});

test("Arguments table declares --defer-decisions", () => {
  const args = skill.slice(skill.indexOf("## Arguments"), skill.indexOf("## Step 0"));
  assert.match(args, /--defer-decisions/);
  assert.match(args, /never ask/i);
});

test("Step 8 BLOCK branch carries a <ADEV_ROOT>-anchored conditional-loading pointer to step-8-decision-ask-round.md", () => {
  const step8 = skill.slice(skill.indexOf("## Step 8:"), skill.indexOf("## Gate Behavior"));
  assert.ok(step8.includes(`> **Conditional loading:** Read \`${POINTER}\``));
  assert.ok(existsSync(resolveSkillPointer(POINTER)));
});

test("ask-round reference: runs adev decisions pending, asks each duplicate_of group once, <=4 questions per call, ceil(n/4) calls back-to-back, then at most one numbered message", () => {
  const r = askRound();
  assert.match(r, /adev decisions pending --spec <spec-path> --json/);
  assert.match(r, /duplicate_of/);
  assert.match(r, /`duplicate_of` group is one question: ask it once, through its first entry/);
  assert.match(r, /at most 4 questions per call/i);
  assert.match(r, /ceil\(n\/4\)/);
  assert.match(r, /back-to-back/);
  assert.match(r, /at most one (numbered )?message/i);
  assert.match(r, /implications/);
});

test("ask-round reference: unanswered / errored / no-reply stays open, no re-ask, no default, verdict stays BLOCK", () => {
  const r = askRound();
  assert.match(r, /stays open/i);
  assert.match(r, /no answer or an error/i);
  assert.match(r, /never re-ask/i);
  assert.match(r, /no (timeout|default)/i);
  assert.match(r, /verdict stays BLOCK/i);
});

test("ask-round reference: records with one adev decisions record, answer applied to every blocker_id in the group", () => {
  const r = askRound();
  assert.match(r, /adev decisions record --spec <spec-path> --answers @/);
  assert.match(r, /one `adev decisions record`/);
  assert.match(r, /every blocker_id in (that|the) group/);
  assert.match(r, /\.context-index\/packets\//);
});

test("ask-round reference: only ask:true groups are asked; overflow listed in the summary", () => {
  const r = askRound();
  assert.match(r, /take only groups marked `ask: true`/);
  assert.match(r, /ask_round/);
  assert.match(r, /At most 16 groups per round are `ask: true`/);
  assert.match(r, /`ask: false`[^)]*\) is not asked and stays open/);
});

test("ask-round reference: structured tool never invoked without an attending operator; headless callers pass --defer-decisions", () => {
  const r = askRound();
  assert.match(r, /only when an operator is attending/);
  assert.match(r, /not running as a dispatched subagent/);
  assert.match(r, /headless[^.]*asks nothing/i);
  assert.match(r, /tool is never reached without an operator/);
  assert.match(r, /--defer-decisions/);
  assert.match(r, /no timeout of its own/i);
  assert.match(r, /harness hang/i);
});

test("with --defer-decisions Step 8 lists every pending question and options and asks nothing", () => {
  const r = askRound();
  assert.match(r, /With `--defer-decisions`/);
  assert.match(r, /lists? every pending decision/i);
  assert.match(r, /asks? nothing/i);
});

test("BLOCK summary names adev decisions record then /adev:specify --revise", () => {
  const r = askRound();
  const rec = r.search(/Next steps/i);
  assert.ok(rec >= 0);
  const tail = r.slice(rec);
  assert.ok(tail.indexOf("adev decisions record") >= 0);
  assert.ok(tail.indexOf("adev decisions record") < tail.indexOf("/adev:specify --revise"));
  assert.match(r, /open decisions from every cause: unanswered, errored, no reply, overflow/i);
  assert.match(r, /Under `--defer-decisions`, omit the "Decisions recorded this round" line/);
});

test("ask-round reference has no inline Node or executable fenced JavaScript", () => {
  const r = askRound();
  assert.doesNotMatch(r, /node -e|node --input-type/);
  assert.doesNotMatch(r, /```(javascript|js)/);
});
