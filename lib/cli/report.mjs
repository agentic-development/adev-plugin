// lib/cli/report.mjs
//
// `adev report` — CLI surface for the lifecycle-state per-check event
// emitters. Replaces the inline-Node `reportValidator` block formerly
// embedded in skills/validate/SKILL.md ("Per-Check Event Emission" section).
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: Task 2 (extract reportValidator per-check emission).
//
// The verb is multi-mode by design (spec Behavior 9 — CLI-verb naming is
// canonical and shared across PRs). Task 2 implements `--type validator`.
// Task 3 will add `--type step` to the same module so that skills calling
// `reportStep` use the same `adev report` surface.
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
// CLI surface (Task 3 — reserved, currently rejected with exit 1):
//   adev report --type step --spec <p> --step <name> --status <s> [--verdict <v>]
//
// Stdout: silent on success (mirrors the silent semantics of reportValidator
// when called inline). Errors go to stderr with usage.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { reportValidator } from "../lifecycle-state.mjs";

const USAGE =
  "usage: adev report --type <validator|step> --spec <p> --step <name> [type-specific flags]";

const VALID_VERDICTS = new Set(["PASS", "PASS_WITH_NOTES", "FAIL"]);

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
        verdict: { type: "string" },
        error: { type: "string" },
        score: { type: "string" },
        "duration-ms": { type: "string" },
        notes: { type: "string" },
        domain: { type: "string" },
        status: { type: "string" }, // reserved for --type step (Task 3)
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
    console.error("  missing --type (one of: validator, step)");
    process.exit(1);
  }

  // ── Type dispatch ────────────────────────────────────────────────────────
  if (v.type === "step") {
    // Task 3 will implement this. The seam is intentional — tests/cli/report.test.mjs
    // asserts the rejection so Task 3 can flip the expectation.
    console.error(
      "--type step is not yet implemented (reserved for Task 3 of the inline-Node extraction sweep)",
    );
    process.exit(1);
  }

  if (v.type !== "validator") {
    console.error(USAGE);
    console.error(`  unknown --type ${JSON.stringify(v.type)} (expected validator or step)`);
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
  console.log("Usage: adev report --type <validator|step> --spec <p> --step <name> [type-specific flags]");
  console.log("");
  console.log("Append a lifecycle event to .context-index/lifecycle-state/<slug>.jsonl.");
  console.log("Replaces inline-Node `reportValidator` / `reportStep` calls formerly");
  console.log("embedded in skill files.");
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
  console.log("--type step (Task 3 — reserved):");
  console.log("  Not yet implemented. Reserved for the extraction of `reportStep`.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  event appended successfully (silent stdout)");
  console.log("  1  argument error or spec not found");
  console.log("  2  gate-blocked (strict event-diagnostics mode rejection)");
}
