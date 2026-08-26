// lib/cli/report.mjs
//
// `adev report` — CLI surface for the lifecycle-state event emitters.
//
// The verb is multi-mode by design (spec Behavior 9 — CLI-verb naming is
// canonical and shared across PRs). `--type validator` delegates to
// `reportValidator` (per-check event inside a step). `--type step`
// delegates to `reportStep` (lifecycle entry/exit transition).
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — this helper appends a per-check event
//     inside the validate step; it is not a step entry/exit itself. The
//     cli-driver pattern test (tests/cli-driver-pattern.test.mjs) does NOT
//     assert requireGate-first on this module.
//
// Exit codes (per hook protocol):
//   0  event appended successfully
//   1  argument error or spec containment failure
//   2  GateError thrown from appendEvent (strict event-diagnostics mode);
//      caught by cli/index.mjs::dispatch and converted to exit 2.
//
// CLI surface:
//   adev report --type validator
//               --spec <p>
//               --step <name>
//               --validator <id>
//               --verdict <PASS|PASS_WITH_NOTES|FAIL|BLOCK>
//               [--error <text>] [--score <number>] [--duration-ms <number>]
//               [--notes <text>] [--domain <name>]
//
// CLI surface (Explicit Governance Registries):
//   adev report --type validator … [--gate-outcomes <json|@path>]
//                                  [--manifest-sha <sha>]
//   `--gate-outcomes` accepts either a JSON array literal or `@<path>` naming
//   a JSON file (long gate sets exceed argv length limits). Both flags are
//   parsed here and DELEGATED verbatim to `reportValidator`; the array's
//   schema is validated by the lib (`validateGateOutcomes` in
//   lib/lifecycle-state.mjs), never re-implemented here.
//
// CLI surface:
//   adev report --type step
//               --spec <p>
//               --step <name>
//               --status <started|completed|failed>
//               [--verdict <PASS|PASS_WITH_NOTES|FAIL|BLOCK>] [--revision <n>]
//
// CLI surface:
//   adev report --type reviewer
//               --spec <p>
//               --step <name>
//               --reviewer <id>
//               --verdict <PASS|PASS_WITH_NOTES|FAIL|BLOCK>
//               [--notes <text>] [--domain <name>] [--revision <n>]
//   `--revision` (review-block-auto-retry.spec.md Behavior 4) is shared with
//   `--type step`: both feed `reportStep`/`reportReviewer`, whose payloads
//   both accept the optional integer field, per lifecycle-event-log.spec.md's
//   fold rule for `reviewer_report` / `step_completed` / `step_failed` /
//   `lifecycle_step`. `--type validator` has no such flag — `validator_report`
//   is not in that fold list, and `reportValidator` accepts no `revision`.
//
// CLI surface (Review-Round Provenance):
//   adev report --type review-round
//               --spec <p>
//               --plan <p>
//               --task-id <id>
//               --stage <spec-compliance|code-quality|synthesized>
//               --cycles <n>
//               [--findings <m>]
//   Argument semantics (closed key allow-list, closed stage enum, `cycles >= 1`,
//   `findings >= 0`, and the stages for which `findings` is countable) are owned
//   by `reportReviewRound` in lib/lifecycle-state.mjs and are NOT re-implemented
//   here — the log is append-only, so a single authority is what keeps a
//   malformed event out of it via any caller. This verb converts the two numeric
//   flags explicitly (refusing non-integer text against the flag name) and
//   delegates; a thrown `EVENT_SCHEMA_INVALID` becomes a stack-free exit 1.
//
// Stdout: silent on success (mirrors the silent semantics of reportValidator
// / reportStep when called inline). Errors go to stderr with usage.

import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveContained } from "../path-safety.mjs";

import {
  reportValidator,
  reportStep,
  reportReviewer,
  reportPlanTask,
  reportIntervention,
  reportRecoveryRecord,
  reportReviewRound,
} from "../lifecycle-state.mjs";
import { aggregate } from "../cost-summary.mjs";

/**
 * The `--type` values this verb's dispatcher actually accepts.
 *
 * Single source of truth: `USAGE`, the missing-`--type` message, the
 * unknown-`--type` message, and `help()`'s usage line are ALL derived from this
 * array, so they cannot independently drift apart (e.g. listing different
 * numbers of values).
 *
 * `recovery`: the only producer of the `recovery_record`
 * discriminator. `--type intervention` emits `debug_intervention` whatever its
 * `--kind` says, so `/adev:recover` needed its own type here.
 *
 * KNOWN DISCREPANCY: `docs/cli-reference.md` documents a
 * `cost-checkpoint` value that has no dispatcher branch here, so the CLI rejects
 * it. It is deliberately absent from this array — implementing it is out of
 * scope for review-provenance. Follow-up: either
 * implement a `--type cost-checkpoint` branch or drop the value from
 * `docs/cli-reference.md` § `adev report`.
 */
export const REPORT_TYPES = Object.freeze([
  "validator",
  "step",
  "reviewer",
  "plan-task",
  "intervention",
  "recovery",
  "review-round",
]);

// Two renderings of the same vocabulary: `<a|b|c>` for the usage lines,
// `a, b, c` for prose error messages.
const REPORT_TYPE_ALTERNATION = REPORT_TYPES.join("|");
const REPORT_TYPE_LIST = REPORT_TYPES.join(", ");

const USAGE = `usage: adev report --type <${REPORT_TYPE_ALTERNATION}> --spec <p> [type-specific flags]`;

// Canonical lifecycle verdict vocabulary.
//
// BLOCK is first-class, not a synonym for FAIL: it is the consolidated
// review verdict emitted by /adev:review-specs (SKILL.md § Verdict Logic —
// "at least one `blocker` finding" → BLOCK) and computed by
// `computeVerdict` in lib/governance/review-config.mjs against
// `verdictRules.blocker_threshold`. It drives the `.blockers.md` sidecar
// (lib/blockers-writer.mjs) and the BLOCK→revise auto-retry loop
// (lib/loop-convergence.mjs). Rejecting it here silently dropped review
// outcomes from the lifecycle log (issue-584 / issue-624).
//
// BLOCK is NOT a passing verdict: `PASSING_VERDICTS` in
// lib/lifecycle-state.mjs is an allow-list of {PASS, PASS_WITH_NOTES}, so
// `requireGate` blocks downstream steps on a BLOCK verdict, and
// `aggregateReports` synthesizes {verdict: BLOCK, status: completed} when
// an actor report carries it.
const VALID_VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL", "BLOCK"]);
const VERDICT_LIST = [...VALID_VERDICTS].join(", ");
const VALID_STEP_STATUSES = new Set(["started", "completed", "failed"]);

/**
 * Parse a numeric flag with a descriptive error. Returns { ok, value } on
 * success, { ok: false, error } on failure.
 */
function parseNumeric(raw, flagName) {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      error: `--${flagName} must be numeric (got ${JSON.stringify(raw)})`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Parse an integer flag with a descriptive error. Returns { ok, value } on
 * success, { ok: false, error } on failure.
 *
 * Stricter than {@link parseNumeric} on purpose: `Number("two")` is `NaN` and
 * `Number("1.5")` is a float, and both would otherwise reach the lib, which
 * reports them against the payload field (`cycles`) rather than the flag the
 * operator typed. Refusing here — matching the flag-shaped wording of the other
 * argument errors in this file — is what makes the message actionable. The
 * regexp also excludes exponent forms (`1e40`), which `Number.isInteger` alone
 * accepts.
 */
function parseIntegerFlag(raw, flagName) {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!/^-?\d+$/.test(raw)) {
    return {
      ok: false,
      error: `--${flagName} must be an integer (got ${JSON.stringify(raw)})`,
    };
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    return {
      ok: false,
      error: `--${flagName} must be an integer (got ${JSON.stringify(raw)})`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Parse the `--gate-outcomes` value into a JS value. Accepts either a JSON
 * array literal or `@<path>` naming a JSON file inside the project root.
 *
 * This function ONLY parses. It performs no schema validation on the parsed
 * value — `reportValidator` owns that (see `validateGateOutcomes` in
 * lib/lifecycle-state.mjs), exactly as the lib (not this verb) owns severity.
 *
 * Returns { ok: true, value } or { ok: false, error } — every error string
 * names `--gate-outcomes` so the operator can locate the offending flag.
 */
function parseGateOutcomes(raw, absRoot) {
  let text = raw;
  let origin = "--gate-outcomes";

  if (raw.startsWith("@")) {
    const relPath = raw.slice(1);
    if (relPath.length === 0) {
      return {
        ok: false,
        error: "--gate-outcomes @<path> requires a path after '@'",
      };
    }
    // Containment: same rule the rest of lib/cli/ applies to operator-supplied
    // paths (resolveContained + "escapes project root"). A gate-outcomes file
    // outside the tree is refused rather than read.
    const abs = resolveContained(absRoot, relPath);
    if (!abs) {
      return {
        ok: false,
        error: `--gate-outcomes path escapes project root: ${relPath}`,
      };
    }
    try {
      text = readFileSync(abs, "utf8");
    } catch (err) {
      return {
        ok: false,
        error: `--gate-outcomes could not read ${relPath}: ${err && err.message ? err.message : String(err)}`,
      };
    }
    origin = `--gate-outcomes @${relPath}`;
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      error: `${origin} is not valid JSON: ${err && err.message ? err.message : String(err)}`,
    };
  }
}

export async function run({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        type: { type: "string" },
        spec: { type: "string" },
        step: { type: "string" },
        validator: { type: "string" },
        reviewer: { type: "string" },
        verdict: { type: "string" },
        error: { type: "string" },
        score: { type: "string" },
        "duration-ms": { type: "string" },
        notes: { type: "string" },
        domain: { type: "string" },
        // validator-only: per-gate outcomes + the source-manifest sha they
        // were computed against (Explicit Governance Registries).
        "gate-outcomes": { type: "string" },
        "manifest-sha": { type: "string" },
        status: { type: "string" }, // step | plan-task
        // step / reviewer: tag the event with the spec revision it belongs to
        // (Behavior 4, review-block-auto-retry.spec.md) — reportStep() and
        // reportReviewer() already accept and validate this; only the CLI
        // never exposed it.
        revision: { type: "string" },
        // plan-task fields (--plan / --task-id are shared with review-round)
        plan: { type: "string" },
        "task-id": { type: "string" },
        // review-round-only fields (Review-Round Provenance).
        // --cycles / --findings are numeric; they are parsed as strings here and
        // converted by parseIntegerFlag so non-integer text is refused by name.
        stage: { type: "string" },
        cycles: { type: "string" },
        findings: { type: "string" },
        // intervention fields
        kind: { type: "string" },
        note: { type: "string" },
        // recovery fields
        ref: { type: "string" },
        category: { type: "string" },
        // step --from-summary: aggregate cost and embed into step_completed
        "from-summary": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;

  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.type) {
    console.error(USAGE);
    console.error(`  missing --type (one of: ${REPORT_TYPE_LIST})`);
    process.exit(1);
  }

  // `--gate-outcomes` / `--manifest-sha` are meaningful ONLY on the
  // `validator_report` payload. Refuse loudly rather than silently dropping
  // them on another --type, so a mis-typed invocation cannot look successful
  // while the outcomes never reach the log.
  if (v.type !== "validator") {
    if (v["gate-outcomes"] !== undefined) {
      console.error("--gate-outcomes is only valid with --type validator");
      process.exit(1);
    }
    if (v["manifest-sha"] !== undefined) {
      console.error("--manifest-sha is only valid with --type validator");
      process.exit(1);
    }
  }

  // Same discipline for the `review_round`-only flags: a `--cycles` typed onto
  // `--type step` must fail rather than look successful while the count never
  // reaches the log.
  if (v.type !== "review-round") {
    for (const flag of ["stage", "cycles", "findings"]) {
      if (v[flag] !== undefined) {
        console.error(`--${flag} is only valid with --type review-round`);
        process.exit(1);
      }
    }
  }

  // ── Type dispatch ────────────────────────────────────────────────────────
  if (v.type === "step") {
    // ── --type step: validate required flags ──────────────────────────────
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type step requires --spec");
      process.exit(1);
    }
    if (!v.step) {
      console.error(USAGE);
      console.error("  --type step requires --step");
      process.exit(1);
    }
    if (!v.status) {
      console.error(USAGE);
      console.error("  --type step requires --status");
      process.exit(1);
    }
    if (!VALID_STEP_STATUSES.has(v.status)) {
      console.error(
        `--status must be one of: started, completed, failed (got ${JSON.stringify(v.status)})`,
      );
      process.exit(1);
    }
    // --verdict is optional but, when present, must be from the canonical
    // verdict set so the surface stays consistent with --type validator.
    if (v.verdict !== undefined && !VALID_VERDICTS.has(v.verdict)) {
      console.error(
        `--verdict must be one of: ${VERDICT_LIST} (got ${JSON.stringify(v.verdict)})`,
      );
      process.exit(1);
    }
    // --from-summary only valid with --status completed
    if (v["from-summary"] && v.status !== "completed") {
      console.error("--from-summary is only valid with --status completed");
      process.exit(1);
    }

    // Spec containment + existence.
    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    let revisionValue;
    if (v.revision !== undefined) {
      const parsedRevision = parseNumeric(v.revision, "revision");
      if (!parsedRevision.ok) {
        console.error(parsedRevision.error);
        process.exit(1);
      }
      if (!Number.isInteger(parsedRevision.value) || parsedRevision.value < 1) {
        console.error(`--revision must be an integer >= 1 (got ${JSON.stringify(v.revision)})`);
        process.exit(1);
      }
      revisionValue = parsedRevision.value;
    }

    const args = { step: v.step, status: v.status };
    if (v.verdict !== undefined) args.verdict = v.verdict;
    if (revisionValue !== undefined) args.revision = revisionValue;

    if (v["from-summary"]) {
      const result = await aggregate({ projectRoot: absRoot, specPath: v.spec });
      if (result.totals !== null) {
        args.totals = result.totals;
        if (result.model_breakdown) args.model_breakdown = result.model_breakdown;
        if (result.skipped_lines) args.skipped_lines = result.skipped_lines;
      }
    }

    reportStep(absRoot, v.spec, args);
    // Silent success — exit 0 via cli/index.mjs::dispatch wrapper.
    return;
  }

  if (v.type === "reviewer") {
    // ── --type reviewer: validate required flags ──────────────────────────
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type reviewer requires --spec");
      process.exit(1);
    }
    if (!v.step) {
      console.error(USAGE);
      console.error("  --type reviewer requires --step");
      process.exit(1);
    }
    if (!v.reviewer) {
      console.error(USAGE);
      console.error("  --type reviewer requires --reviewer");
      process.exit(1);
    }
    if (!v.verdict) {
      console.error(USAGE);
      console.error("  --type reviewer requires --verdict");
      process.exit(1);
    }
    if (!VALID_VERDICTS.has(v.verdict)) {
      console.error(
        `--verdict must be one of: ${VERDICT_LIST} (got ${JSON.stringify(v.verdict)})`,
      );
      process.exit(1);
    }

    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    let reviewerRevisionValue;
    if (v.revision !== undefined) {
      const parsedRevision = parseNumeric(v.revision, "revision");
      if (!parsedRevision.ok) {
        console.error(parsedRevision.error);
        process.exit(1);
      }
      if (!Number.isInteger(parsedRevision.value) || parsedRevision.value < 1) {
        console.error(`--revision must be an integer >= 1 (got ${JSON.stringify(v.revision)})`);
        process.exit(1);
      }
      reviewerRevisionValue = parsedRevision.value;
    }

    const args = {
      step: v.step,
      reviewer: v.reviewer,
      verdict: v.verdict,
    };
    if (v.notes !== undefined) args.notes = v.notes;
    if (v.domain !== undefined) args.domain = v.domain;
    if (reviewerRevisionValue !== undefined) args.revision = reviewerRevisionValue;
    reportReviewer(absRoot, v.spec, args);
    return;
  }

  if (v.type === "plan-task") {
    // ── --type plan-task: validate required flags ─────────────────────────
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type plan-task requires --spec");
      process.exit(1);
    }
    if (!v.plan) {
      console.error(USAGE);
      console.error("  --type plan-task requires --plan");
      process.exit(1);
    }
    if (!v["task-id"]) {
      console.error(USAGE);
      console.error("  --type plan-task requires --task-id");
      process.exit(1);
    }
    if (!v.status) {
      console.error(USAGE);
      console.error("  --type plan-task requires --status");
      process.exit(1);
    }
    // Plan-task statuses are a superset of step statuses per
    // lib/lifecycle-state.mjs reportPlanTask doc: pending, in_progress,
    // done, blocked, skipped. The library accepts free-form strings, but
    // the canonical set is enforced here for surface consistency.
    const VALID_PLAN_STATUSES = new Set([
      "pending",
      "in_progress",
      "done",
      "blocked",
      "skipped",
    ]);
    if (!VALID_PLAN_STATUSES.has(v.status)) {
      console.error(
        `--status must be one of: ${[...VALID_PLAN_STATUSES].join(", ")} (got ${JSON.stringify(v.status)})`,
      );
      process.exit(1);
    }

    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    // Plan path: containment-checked but allowed to be a not-yet-existing
    // file. The plan file may be authored after the first task event lands
    // in some workflows (e.g., /adev:plan retroactive stamping).
    const absPlan = resolveContained(absRoot, v.plan);
    if (!absPlan) {
      console.error(`plan path escapes project root: ${v.plan}`);
      process.exit(1);
    }

    const args = {
      plan: v.plan,
      task_id: v["task-id"],
      status: v.status,
    };
    if (v.notes !== undefined) args.notes = v.notes;
    reportPlanTask(absRoot, v.spec, args);
    return;
  }

  if (v.type === "review-round") {
    // ── --type review-round: validate required flags ──────────────────────
    // Presence only. The VALUE rules (stage enum, cycles >= 1, findings >= 0,
    // and which stages accept findings) belong to `reportReviewRound`; stating
    // them here too would create a second authority that can drift from the
    // append-only log's actual guard.
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type review-round requires --spec");
      process.exit(1);
    }
    if (!v.plan) {
      console.error(USAGE);
      console.error("  --type review-round requires --plan");
      process.exit(1);
    }
    if (!v["task-id"]) {
      console.error(USAGE);
      console.error("  --type review-round requires --task-id");
      process.exit(1);
    }
    if (!v.stage) {
      console.error(USAGE);
      console.error("  --type review-round requires --stage");
      process.exit(1);
    }
    if (v.cycles === undefined) {
      console.error(USAGE);
      console.error("  --type review-round requires --cycles");
      process.exit(1);
    }

    // Explicit string → number conversion. Non-integer text is refused against
    // the flag name rather than silently becoming NaN or a float.
    const cyclesResult = parseIntegerFlag(v.cycles, "cycles");
    if (!cyclesResult.ok) {
      console.error(cyclesResult.error);
      process.exit(1);
    }
    const findingsResult = parseIntegerFlag(v.findings, "findings");
    if (!findingsResult.ok) {
      console.error(findingsResult.error);
      process.exit(1);
    }

    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    // Plan path: containment-checked but allowed not to exist yet, same rule as
    // --type plan-task above.
    const absPlan = resolveContained(absRoot, v.plan);
    if (!absPlan) {
      console.error(`plan path escapes project root: ${v.plan}`);
      process.exit(1);
    }

    const args = {
      plan: v.plan,
      task_id: v["task-id"],
      stage: v.stage,
      cycles: cyclesResult.value,
    };
    // `undefined` means "flag absent": findings is OMITTED from the payload
    // rather than written as null or 0, so absence reads as "not recorded".
    if (v.findings !== undefined) args.findings = findingsResult.value;

    try {
      reportReviewRound(absRoot, v.spec, args);
    } catch (err) {
      // Same allow-list as the validator path: only the operator-input class
      // (EVENT_SCHEMA_INVALID, which names the offending field) is flattened
      // into a stack-free exit 1. GateError and genuine crashes propagate to
      // cli/index.mjs::dispatch with their stacks intact.
      if (!err || err.code !== "EVENT_SCHEMA_INVALID") throw err;
      console.error(err.message ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (v.type === "intervention") {
    // ── --type intervention: validate required flags ──────────────────────
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type intervention requires --spec");
      process.exit(1);
    }
    if (!v.kind) {
      console.error(USAGE);
      console.error("  --type intervention requires --kind");
      process.exit(1);
    }
    if (!v.note) {
      console.error(USAGE);
      console.error("  --type intervention requires --note");
      process.exit(1);
    }

    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    reportIntervention(absRoot, v.spec, { kind: v.kind, note: v.note });
    return;
  }

  if (v.type === "recovery") {
    // ── --type recovery: validate required flags ──────────────────────────
    // Emits the `recovery_record` canonical event. Distinct from
    // `--type intervention --kind recover`, which emits `debug_intervention`
    // regardless of its kind: `recovery_record` is its own discriminator in
    // CANONICAL_EVENTS and had no producer before this branch.
    if (!v.spec) {
      console.error(USAGE);
      console.error("  --type recovery requires --spec");
      process.exit(1);
    }
    if (!v.ref) {
      console.error(USAGE);
      console.error("  --type recovery requires --ref");
      process.exit(1);
    }

    const absRoot = resolve(projectRoot);
    const absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec || !existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }

    const args = { ref: v.ref };
    if (v.category !== undefined) args.category = v.category;
    if (v.note !== undefined) args.note = v.note;
    reportRecoveryRecord(absRoot, v.spec, args);
    return;
  }

  if (v.type !== "validator") {
    console.error(USAGE);
    console.error(
      `  unknown --type ${JSON.stringify(v.type)} (expected ${REPORT_TYPE_LIST})`,
    );
    process.exit(1);
  }

  // ── --type validator: validate required flags ───────────────────────────
  if (!v.spec) {
    console.error(USAGE);
    console.error("  --type validator requires --spec");
    process.exit(1);
  }
  if (!v.step) {
    console.error(USAGE);
    console.error("  --type validator requires --step");
    process.exit(1);
  }
  if (!v.validator) {
    console.error(USAGE);
    console.error("  --type validator requires --validator");
    process.exit(1);
  }
  if (!v.verdict) {
    console.error(USAGE);
    console.error("  --type validator requires --verdict");
    process.exit(1);
  }

  if (!VALID_VERDICTS.has(v.verdict)) {
    console.error(
      `--verdict must be one of: ${VERDICT_LIST} (got ${JSON.stringify(v.verdict)})`,
    );
    process.exit(1);
  }

  // Numeric coercion for --score and --duration-ms.
  const scoreResult = parseNumeric(v.score, "score");
  if (!scoreResult.ok) {
    console.error(scoreResult.error);
    process.exit(1);
  }
  const durationResult = parseNumeric(v["duration-ms"], "duration-ms");
  if (!durationResult.ok) {
    console.error(durationResult.error);
    process.exit(1);
  }

  // ── Spec containment + existence ────────────────────────────────────────
  const absRoot = resolve(projectRoot);
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) {
    console.error(`spec not found: ${v.spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${v.spec}`);
    process.exit(1);
  }

  // `--gate-outcomes`: parse only (literal JSON or `@path`). The parsed value
  // is handed to the lib unexamined — schema enforcement lives in
  // `validateGateOutcomes`, and duplicating it here would let the two drift.
  let gateOutcomes;
  if (v["gate-outcomes"] !== undefined) {
    const parsedOutcomes = parseGateOutcomes(v["gate-outcomes"], absRoot);
    if (!parsedOutcomes.ok) {
      console.error(parsedOutcomes.error);
      process.exit(1);
    }
    gateOutcomes = parsedOutcomes.value;
  }

  // ── Delegate to reportValidator ─────────────────────────────────────────
  // The lib stamps severity from gates.yaml domain config; we never compute
  // it here (matches skills/validate/SKILL.md "Per-Check Event Emission"
  // prose — severity is NOT a skill responsibility). The same discipline
  // applies to gate_outcomes: the lib validates and normalises the array;
  // this verb never constructs the payload.
  const args = {
    step: v.step,
    validator: v.validator,
    verdict: v.verdict,
  };
  if (v.error !== undefined) args.error = v.error;
  if (scoreResult.value !== undefined) args.score = scoreResult.value;
  if (durationResult.value !== undefined) args.duration_ms = durationResult.value;
  if (v.notes !== undefined) args.notes = v.notes;
  if (v.domain !== undefined) args.domain = v.domain;
  // `undefined` means "flag absent"; an empty array is a distinct, meaningful
  // value ("the check ran and produced no outcomes") and must survive.
  if (v["gate-outcomes"] !== undefined) args.gate_outcomes = gateOutcomes;
  if (v["manifest-sha"] !== undefined) args.manifest_sha = v["manifest-sha"];

  try {
    reportValidator(absRoot, v.spec, args);
  } catch (err) {
    // Allow-list, not deny-list: ONLY the operator-input class is converted to
    // a friendly stack-free exit 1. Everything else — GateError (`GATE_BLOCKED`,
    // which cli/index.mjs::dispatch turns into exit 2), `FS_ERROR`, a TypeError
    // in the lib, an event-diagnostics engine bug — propagates untouched so
    // dispatch can print the stack. The catch wraps the whole append path
    // (manifest load, diagnostics engine, projection, file write), so swallowing
    // by exclusion would strip diagnostics from genuine crashes.
    if (!err || err.code !== "EVENT_SCHEMA_INVALID") throw err;
    // EVENT_SCHEMA_INVALID from validateGateOutcomes: surface the lib's own
    // message, exit 1, and do NOT dump a stack trace.
    console.error(err.message ? err.message : String(err));
    process.exit(1);
  }
  // Silent success — exit 0 via cli/index.mjs::dispatch wrapper.
}

export function help() {
  console.log(`Usage: adev report --type <${REPORT_TYPE_ALTERNATION}> --spec <p> [type-specific flags]`);
  console.log("");
  console.log("Append a lifecycle event to .context-index/lifecycle-state/<slug>.jsonl.");
  console.log("Replaces inline-Node `reportValidator` / `reportStep` / `reportReviewer` /");
  console.log("`reportPlanTask` / `reportIntervention` calls formerly embedded in skill files.");
  console.log("");
  console.log("--type validator (Task 2 — extracted reportValidator):");
  console.log("  Append a `validator_report` event with severity stamped by lib.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the event belongs to");
  console.log("    --step <name>             Lifecycle step emitting the event (e.g., validate)");
  console.log("    --validator <id>          Validator id (e.g., check-2-spec-compliance)");
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL | BLOCK");
  console.log("");
  console.log("  Optional:");
  console.log("    --error <text>            Short error summary on FAIL (≤ 200 chars)");
  console.log("    --score <number>          Numeric score (passed through)");
  console.log("    --duration-ms <number>    Wall-clock duration in ms");
  console.log("    --notes <text>            Operator-facing notes (≤ 200 chars; lib caps at 4 KB)");
  console.log("    --domain <name>           Override domain for severity resolution");
  console.log("    --gate-outcomes <v>       Per-gate outcomes for this check run. Either a JSON");
  console.log("                              array literal or @<path> naming a JSON file inside");
  console.log("                              the project root (long gate sets exceed argv limits).");
  console.log("                              Elements: {id, verdict: pass|fail|skip, tier,");
  console.log("                              command_sha?}. '[]' is preserved as an empty array");
  console.log("                              (ran, no outcomes) and is not collapsed to absent.");
  console.log("    --manifest-sha <sha>      Source-manifest sha the outcomes were computed against");
  console.log("");
  console.log("--type step (Task 3 — extracted reportStep):");
  console.log("  Append a lifecycle step entry/exit event. Discriminator chosen from --status:");
  console.log("    started   → lifecycle_step");
  console.log("    completed → step_completed");
  console.log("    failed    → step_failed");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the event belongs to");
  console.log("    --step <name>             Lifecycle step transitioning (e.g., validate)");
  console.log("    --status <s>              started | completed | failed");
  console.log("");
  console.log("  Optional:");
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL | BLOCK (typically on completed)");
  console.log("                              BLOCK is the consolidated /adev:review-specs verdict;");
  console.log("                              it is NOT a passing verdict for downstream gates.");
  console.log("    --from-summary            Aggregate cost from .session-tracking.jsonl and embed");
  console.log("                              totals into the step_completed event (only with --status completed)");
  console.log("    --revision <n>            Integer >= 1. Tags the event with the spec revision it");
  console.log("                              belongs to — without it, currentState().steps.review.byRevision");
  console.log("                              folds everything into bucket 1 regardless of actual revision.");
  console.log("");
  console.log("--type reviewer (PR 8-9 — extracted reportReviewer):");
  console.log("  Append a `reviewer_report` event with severity stamped by lib.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the event belongs to");
  console.log("    --step <name>             Lifecycle step emitting the event (e.g., review)");
  console.log("    --reviewer <id>           Reviewer id (e.g., structural-review)");
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL | BLOCK");
  console.log("");
  console.log("  Optional:");
  console.log("    --notes <text>            Operator-facing notes (≤ 200 chars; lib caps at 4 KB)");
  console.log("    --domain <name>           Override domain for severity resolution");
  console.log("    --revision <n>            Integer >= 1. Tags the event with the spec revision it");
  console.log("                              belongs to — without it, currentState().steps.review.byRevision");
  console.log("                              folds everything into bucket 1 regardless of actual revision.");
  console.log("");
  console.log("--type plan-task (PR 8-9 — extracted reportPlanTask):");
  console.log("  Append a `plan_task` event recording per-plan-task state transitions.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the plan implements");
  console.log("    --plan <path>             Plan file path");
  console.log("    --task-id <id>            Stable task identifier (e.g., 'task-3')");
  console.log("    --status <s>              pending | in_progress | done | blocked | skipped");
  console.log("");
  console.log("  Optional:");
  console.log("    --notes <text>            ≤ 200-char operator-facing summary (no stack traces)");
  console.log("");
  console.log("--type recovery (issue-513 — reportRecoveryRecord):");
  console.log("  Append a `recovery_record` event after /adev:recover writes its");
  console.log("  recovery record. Distinct from --type intervention, which always");
  console.log("  emits `debug_intervention` no matter what --kind says.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the recovery applies to");
  console.log("    --ref <path>              Project-root-relative path to the recovery");
  console.log("                              record just written (absolute paths rejected)");
  console.log("");
  console.log("  Optional:");
  console.log("    --category <c>            Diagnosis category (e.g. MISSING_CONTEXT)");
  console.log("    --note <text>             ≤200-char operator-facing summary");
  console.log("");
  console.log("--type review-round (Review-Round Provenance, Task 6 — reportReviewRound):");
  console.log("  Append a `review_round` event recording per-stage review provenance");
  console.log("  for one /adev:implement plan task.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the plan implements");
  console.log("    --plan <path>             Plan file path");
  console.log("    --task-id <id>            Plan-task identifier (e.g., 'task-3')");
  console.log("    --stage <s>               spec-compliance | code-quality | synthesized");
  console.log("    --cycles <n>              Integer >= 1; a first-pass stage records 1,");
  console.log("                              never absence");
  console.log("");
  console.log("  Optional:");
  console.log("    --findings <m>            Integer >= 0; distinct findings raised. Accepted");
  console.log("                              for code-quality and synthesized only — spec-compliance");
  console.log("                              has no stable finding-id convention, so the count is");
  console.log("                              undefined there. Absent means 'not recorded', never 0.");
  console.log("");
  console.log("--type intervention (PR 8-9 — extracted reportIntervention):");
  console.log("  Append a `debug_intervention` event when a skill applies a recoverable fix.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the intervention applies to");
  console.log("    --kind <kind>             Intervention kind (e.g., 'debug', 'recover')");
  console.log("    --note <text>             Free-form description (≤ 200 chars recommended)");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  event appended successfully (silent stdout)");
  console.log("  1  argument error or spec not found");
  console.log("  2  gate-blocked (strict event-diagnostics mode rejection)");
}
