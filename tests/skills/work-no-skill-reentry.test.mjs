// tests/skills/work-no-skill-reentry.test.mjs
//
// Pins the skill-load deduplication rule in /adev:work's Conductor Mode.
//
// WHY THIS EXISTS. A loaded SKILL.md is not paid for once: it joins the context
// prefix and is re-read on every subsequent turn. One measured lifecycle
// (adev-plugin-04jr.1) loaded `specify` three times and `work` twice — ~31K
// tokens of duplication, multiplied by the remaining turn count rather than
// paid once. Two of the `specify` loads and both `work` loads came from the
// conductor re-entering skills it had already run.
//
// A skill cannot detect from inside itself that its body is already in context,
// so the instruction in Conductor Mode is the only lever available. It reads as
// ordinary prose and would be an easy casualty of a future "tighten this file"
// pass, which is exactly what this test is here to prevent.
//
// Spec: adev-plugin-04jr.1 (approach 3 — composition instead of re-invocation)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSkillSurface } from "../helpers.mjs";

const work = readSkillSurface("work");

test("/adev:work forbids re-invoking itself to advance the arc", () => {
  assert.match(
    work,
    /Never re-invoke `\/adev:work` to advance the arc/,
    "the front door must not be re-entered to pick the next stage",
  );
});

test("/adev:work forbids re-invoking an already-invoked target skill", () => {
  assert.match(
    work,
    /Never re-invoke a target skill you have already invoked in this session/,
    "a second full body load for the same unit of work must be ruled out",
  );
});

test("/adev:work names the two sanctioned ways to run a stage again", () => {
  // Without an alternative the rule is unactionable: a review that comes back
  // BLOCK still has to re-run something. Both escapes must be stated.
  assert.match(
    work,
    /continue from that\s+skill's instructions already in context/,
    "continuing in-place must be offered as an escape",
  );
  assert.match(
    work,
    /dispatch it as a subagent/,
    "subagent dispatch must be offered as an escape — it runs in its own context",
  );
});

test("/adev:work explains why the rule exists, in cost terms", () => {
  // The rationale is load-bearing. Stripped of it, the rule looks like style
  // advice and gets 'simplified' away; the duplication then returns silently
  // because nothing else in the system can observe it.
  assert.match(
    work,
    /re-read on\s+every subsequent turn/,
    "the prefix-re-read mechanism must be stated, not just the prohibition",
  );
  assert.match(work, /adev-plugin-04jr\.1/, "the measurement must stay traceable");
});

test("/adev:work bounds conductor-driven re-runs and states the cap-trip verdict", () => {
  // TERM-1: the prohibition alone is not actionable — a BLOCK still has to
  // re-run something. Without a ceiling the escape it recommends first is an
  // uncapped repeat path, and build's own max_retries / max_review_retries do
  // NOT cover it: those are decremented inside build's state, so a conductor
  // re-running a stage itself spends none of that budget.
  assert.match(work, /Bound the re-runs/, "a ceiling must be stated");
  assert.match(work, /Three per stage/, "the ceiling must be a number, not 'a few'");
  assert.match(
    work,
    /NOT counted by `build\.max_retries`/,
    "must say why build's ceilings do not apply, or a reader will assume they do",
  );
  assert.match(
    work,
    /On the third failure, stop and report/,
    "a cap with no stated cap-trip verdict is not a cap",
  );
});

test("/adev:work makes the unattended default stop, not retry", () => {
  // The confirmation gate reads 'wait for confirmation before invoking a skill'
  // — it gates INVOCATION, and an in-context continuation is expressly not one.
  // So batch/unattended runs have no brake unless one is stated here.
  assert.match(
    work,
    /Unattended runs stop at the first failure/,
    "the unattended default must be stop-and-report",
  );
  assert.match(work, /--intake --file/, "the batch entry point must be named");
});

test("/adev:work says loading a companion is a continuation, not a re-entry", () => {
  // TERM-2: escape (a) collides with BEH-4 under progressive disclosure. What is
  // in context is the body plus only the companions the FIRST branch loaded, and
  // BEH-4 forbids acting from a stub — so without this carve-out the escape
  // listed first is unavailable in exactly the case it was written for.
  assert.match(
    work,
    /Loading a companion is a continuation, not a re-entry/,
    "the carve-out must be explicit or the two rules contradict",
  );
  assert.match(
    work,
    /parallel-mode\.md/,
    "name a concrete branch whose instructions are not in context",
  );
});

test("/adev:work still prefers build for multi-stage arcs", () => {
  // build dispatches each stage as a fresh subagent, so no stage body reaches
  // the orchestrator's context at all — the cheapest available shape.
  assert.match(
    work,
    /Prefer `\/adev:build` for multi-stage arcs/,
    "the cheapest routing shape must remain the documented default",
  );
});
