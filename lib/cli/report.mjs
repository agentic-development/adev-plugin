// lib/cli/report.mjs
//
// `adev report` — CLI surface for the lifecycle-state event emitters.
// Replaces the inline-Node `reportValidator` and `reportStep` blocks
// formerly embedded in skills/*/SKILL.md.
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Tasks: Task 2 (extract reportValidator per-check emission)
//        Task 3 (extract reportStep lifecycle entry/exit emission)
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
// CLI surface (Task 2):
//   adev report --type validator
//               --spec <p>
//               --step <name>
//               --validator <id>
//               --verdict <PASS|PASS_WITH_NOTES|FAIL>
//               [--error <text>] [--score <number>] [--duration-ms <number>]
//               [--notes <text>] [--domain <name>]
//
// CLI surface (Task 3):
//   adev report --type step
//               --spec <p>
//               --step <name>
//               --status <started|completed|failed>
//               [--verdict <PASS|PASS_WITH_NOTES|FAIL>]
//
// Stdout: silent on success (mirrors the silent semantics of reportValidator
// / reportStep when called inline). Errors go to stderr with usage.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import {
  reportValidator,
  reportStep,
  reportReviewer,
  reportPlanTask,
  reportIntervention,
} from "../lifecycle-state.mjs";

const USAGE =
  "usage: adev report --type <validator|step|reviewer|plan-task|intervention> --spec <p> [type-specific flags]";

const VALID_VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL"]);
const VALID_STEP_STATUSES = new Set(["started", "completed", "failed"]);

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1): resolve `relPath`
 * against `absRoot` and reject anything that escapes the tree.
 * Returns the absolute path on success, or null on out-of-bounds.
 */
function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

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
        status: { type: "string" }, // step | plan-task
        // plan-task fields
        plan: { type: "string" },
        "task-id": { type: "string" },
        // intervention fields
        kind: { type: "string" },
        note: { type: "string" },
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
    console.error(
      "  missing --type (one of: validator, step, reviewer, plan-task, intervention)",
    );
    process.exit(1);
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
    // tri-state set so the surface stays consistent with --type validator.
    if (v.verdict !== undefined && !VALID_VERDICTS.has(v.verdict)) {
      console.error(
        `--verdict must be one of: PASS, PASS_WITH_NOTES, FAIL (got ${JSON.stringify(v.verdict)})`,
      );
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

    const args = { step: v.step, status: v.status };
    if (v.verdict !== undefined) args.verdict = v.verdict;
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
        `--verdict must be one of: PASS, PASS_WITH_NOTES, FAIL (got ${JSON.stringify(v.verdict)})`,
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

    const args = {
      step: v.step,
      reviewer: v.reviewer,
      verdict: v.verdict,
    };
    if (v.notes !== undefined) args.notes = v.notes;
    if (v.domain !== undefined) args.domain = v.domain;
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

  if (v.type !== "validator") {
    console.error(USAGE);
    console.error(
      `  unknown --type ${JSON.stringify(v.type)} (expected validator, step, reviewer, plan-task, intervention)`,
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
      `--verdict must be one of: PASS, PASS_WITH_NOTES, FAIL (got ${JSON.stringify(v.verdict)})`,
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

  // ── Delegate to reportValidator ─────────────────────────────────────────
  // The lib stamps severity from gates.yaml domain config; we never compute
  // it here (matches skills/validate/SKILL.md "Per-Check Event Emission"
  // prose — severity is NOT a skill responsibility).
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

  reportValidator(absRoot, v.spec, args);
  // Silent success — exit 0 via cli/index.mjs::dispatch wrapper.
}

export function help() {
  console.log("Usage: adev report --type <validator|step|reviewer|plan-task|intervention> --spec <p> [type-specific flags]");
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
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL");
  console.log("");
  console.log("  Optional:");
  console.log("    --error <text>            Short error summary on FAIL (≤ 200 chars)");
  console.log("    --score <number>          Numeric score (passed through)");
  console.log("    --duration-ms <number>    Wall-clock duration in ms");
  console.log("    --notes <text>            Operator-facing notes (≤ 200 chars; lib caps at 4 KB)");
  console.log("    --domain <name>           Override domain for severity resolution");
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
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL (typically on completed)");
  console.log("");
  console.log("--type reviewer (PR 8-9 — extracted reportReviewer):");
  console.log("  Append a `reviewer_report` event with severity stamped by lib.");
  console.log("");
  console.log("  Required:");
  console.log("    --spec <path>             Live Spec the event belongs to");
  console.log("    --step <name>             Lifecycle step emitting the event (e.g., review)");
  console.log("    --reviewer <id>           Reviewer id (e.g., structural-review)");
  console.log("    --verdict <v>             PASS | PASS_WITH_NOTES | FAIL");
  console.log("");
  console.log("  Optional:");
  console.log("    --notes <text>            Operator-facing notes (≤ 200 chars; lib caps at 4 KB)");
  console.log("    --domain <name>           Override domain for severity resolution");
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
