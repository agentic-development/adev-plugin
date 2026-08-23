// tests/skills/step-failed-emission.test.mjs
//
// Prose-contract tests for issue-513: every skill that emits a lifecycle
// step-entry event MUST also document the matching failure-path terminal.
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
//
// A skill that emits `--status started` and then aborts without emitting a
// terminal leaves the lifecycle log with a stranded step — invisible to
// `currentState()` consumers, and a dead run indistinguishable from a clean
// one. Only five skills participate in the per-spec step channel (specify,
// review-specs, plan, implement, validate); the rest of skills/* are not
// STEP_ORDER steps and have no `--spec` to attach an event to, so they are
// deliberately out of scope.
//
// The `--verdict FAIL` assertion is load-bearing, not stylistic. The
// aggregation pass in lib/lifecycle-state.mjs treats a step terminal as
// explicit only when `typeof step.verdict === 'string'`; a `step_failed`
// emitted without a verdict is overwritten by the verdict synthesized from
// whatever actor reports already landed. Verified empirically: a log of
// [lifecycle_step, validator_report PASS, step_failed (no verdict)] projects
// as `{status: "completed", verdict: "PASS"}`, which opens the next gate.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { readSkillSurface } from "../helpers.mjs";

// Reads SKILL.md plus its references/ companions. These assertions are about
// the emission contract the skill ships, which progressive disclosure moved
// one file out of the body without weakening it.
function readSkill(slug) {
  return readSkillSurface(slug);
}

const NO_INLINE_NODE = /node -e|node --input-type=module|Run inline Node/;
const VERDICT_RATIONALE =
  "a stranded step must be closed out by an explicit step_failed carrying a verdict; " +
  "without --verdict FAIL the aggregation pass projects it as completed/PASS";

// ── Per-skill: entry event, failure terminal, no inline Node ────────────────

test("/adev:specify pairs its step-started emission with a failed terminal", () => {
  const md = readSkill("specify");
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step specify --status started/,
    "precondition: specify must emit a step entry event",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step specify --status failed --verdict FAIL/,
    VERDICT_RATIONALE,
  );
  assert.doesNotMatch(md, NO_INLINE_NODE, "constitution bans executable logic in SKILL.md");
});

test("/adev:review-specs pairs its step-started emission with a failed terminal", () => {
  const md = readSkill("review-specs");
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step review --status started/,
    "precondition: review-specs must emit a step entry event",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step review --status failed --verdict FAIL/,
    VERDICT_RATIONALE,
  );
  assert.doesNotMatch(md, NO_INLINE_NODE, "constitution bans executable logic in SKILL.md");
});

test("/adev:plan pairs its step-started emission with a failed terminal", () => {
  const md = readSkill("plan");
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step plan --status started/,
    "precondition: plan must emit a step entry event",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step plan --status failed --verdict FAIL/,
    VERDICT_RATIONALE,
  );
  assert.doesNotMatch(md, NO_INLINE_NODE, "constitution bans executable logic in SKILL.md");
});

test("/adev:implement pairs its step-started emission with a failed terminal", () => {
  const md = readSkill("implement");
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step implement --status started/,
    "precondition: implement must emit a step entry event",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step implement --status failed --verdict FAIL/,
    VERDICT_RATIONALE,
  );
  assert.doesNotMatch(md, NO_INLINE_NODE, "constitution bans executable logic in SKILL.md");
});

test("/adev:validate pairs its step-started emission with a failed terminal", () => {
  const md = readSkill("validate");
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step validate --status started/,
    "precondition: validate must emit a step entry event",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step validate --status failed --verdict FAIL/,
    VERDICT_RATIONALE,
  );
  assert.doesNotMatch(md, NO_INLINE_NODE, "constitution bans executable logic in SKILL.md");
});

// ── Corrections of prose that claimed coverage that did not exist ───────────

test("/adev:specify no longer claims failure paths already emit --status failed", () => {
  const md = readSkill("specify");
  assert.doesNotMatch(
    md,
    /Failure paths emit `--status failed` separately and do not reach the exit emission\./,
    "issue-513: the claim was untrue — no emission instruction existed anywhere in the file",
  );
});

test("/adev:implement no longer claims earlier failure modes already emit", () => {
  const md = readSkill("implement");
  assert.doesNotMatch(
    md,
    /\(Failure modes earlier in the skill emit `status: failed` separately and do not reach this line\.\)/,
    "issue-513: the parenthetical was untrue — no emission instruction existed",
  );
});

// ── Scoping: aborts that precede the entry event must NOT emit ──────────────

test("/adev:specify records that pre-write aborts cannot emit (spec must exist)", () => {
  const md = readSkill("specify");
  assert.match(
    md,
    /requires `<spec-path>` to exist on disk and exits `1` with `spec not found`/,
    "the ordering constraint must be stated so future edits do not add unreachable emissions",
  );
  assert.match(md, /CHARTER_CLOSED/, "the charter-status gate is named as a non-emitting abort");
  assert.match(md, /PARTIAL_ARTIFACT_OVERSIZE/, "the runaway-write guard is a non-emitting abort");
});

test("/adev:specify keeps --revise out of the step-failed contract", () => {
  const md = readSkill("specify");
  assert.match(
    md,
    /`--revise` mode is unaffected: it emits `spec_revised` rather than step entry\/exit events/,
    "revise emits spec_revised, strands no step, and must not double-report",
  );
});

test("/adev:plan scopes the failure terminal to post-started aborts only", () => {
  const md = readSkill("plan");
  assert.match(md, /INVALID_TARGET_REPO/, "the one gate-passing abort in Step 1 must be listed");
  assert.match(
    md,
    /runs \*before\* the `--status started` event and therefore strands nothing/,
    "the gate and CODE_DRIFT blocks precede the entry event and must not emit",
  );
});

test("/adev:validate scopes the failure terminal to post-started aborts only", () => {
  const md = readSkill("validate");
  assert.match(md, /MISSING_VALIDATE_CONFIG/, "the registry-loader abort must be listed");
  assert.match(
    md,
    /The Prerequisites block[^\n]*runs \*before\* the `--status started` event/,
    "prerequisite failures precede the entry event and must not emit",
  );
});

// ── Non-duplication with the terminals that already exist ──────────────────

test("/adev:implement does not duplicate the Step 2d blocker path", () => {
  const md = readSkill("implement");
  assert.match(
    md,
    /Already covered — do not double-emit/,
    "per-task escalations already terminate through the plan_task blocked event",
  );
  assert.match(md, /LOOP_BUDGET_EXHAUSTED/, "reuse the existing convergence vocabulary");
  assert.match(md, /LOOP_NO_PROGRESS/, "reuse the existing convergence vocabulary");
  assert.match(md, /LOOP_REGRESSED/, "reuse the existing convergence vocabulary");
});

test("/adev:review-specs keeps BLOCK on the completed path, not the failed path", () => {
  const md = readSkill("review-specs");
  assert.match(
    md,
    /A BLOCK verdict is \*\*not\*\* a failure/,
    "aggregateReports deliberately projects BLOCK as {verdict: BLOCK, status: completed}",
  );
  assert.match(
    md,
    /adev report --type step --spec <spec-path> --step review --status completed --verdict <consolidated-verdict>/,
    "the BLOCK exit stays on the completed emission",
  );
});

// ── The --error flag gap must stay documented, never instructed ─────────────

test("no step-emitting skill instructs --error on a --type step emission", () => {
  const specify = readSkill("specify");
  const review = readSkill("review-specs");
  const plan = readSkill("plan");
  const implement = readSkill("implement");
  const validate = readSkill("validate");
  const gap = /accepts no `--error` flag/;
  assert.match(specify, gap, "specify: --error is dropped silently by lib/cli/report.mjs");
  assert.match(review, gap, "review-specs: --error is dropped silently by lib/cli/report.mjs");
  assert.match(plan, gap, "plan: --error is dropped silently by lib/cli/report.mjs");
  assert.match(implement, gap, "implement: --error is dropped silently by lib/cli/report.mjs");
  assert.match(validate, gap, "validate: --error is dropped silently by lib/cli/report.mjs");
  const instructed = /--type step[^\n]*--error |--status failed[^\n]*--error /;
  assert.doesNotMatch(specify, instructed, "instructing --error recreates the 0476a7bc mismatch");
  assert.doesNotMatch(review, instructed, "instructing --error recreates the 0476a7bc mismatch");
  assert.doesNotMatch(plan, instructed, "instructing --error recreates the 0476a7bc mismatch");
  assert.doesNotMatch(implement, instructed, "instructing --error recreates the 0476a7bc mismatch");
  assert.doesNotMatch(validate, instructed, "instructing --error recreates the 0476a7bc mismatch");
});
