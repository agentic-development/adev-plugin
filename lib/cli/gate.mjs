// lib/cli/gate.mjs
//
// adev gate require --skill <name> --spec <path>
// adev gate doctor  [--json] [--execute] [--timeout <s>] [--gates <path>]
//
// Two query primitives over gates, neither of which performs side-effecting
// work:
//
//   require — evaluates a LIFECYCLE gate for a spec. Exit codes:
//     0  gate passes (prior step complete with PASS or PASS_WITH_NOTES verdict)
//     2  gate blocked (GateError, per hook protocol)
//     1  argument error or spec not found
//
//   doctor  — diagnoses whether the QUALITY gates a project declares can
//             actually execute, and whether its tests actually get collected.
//             Spec: .context-index/specs/features/unified-gates/gate-doctor.spec.md
//     0  no error-severity finding
//     2  one or more error-severity findings
//     1  argument error
//
// `doctor` is a sub-verb of `gate` rather than a sibling `gates` verb (which
// is what issue-552 proposed). `adev gate require` and `adev gates doctor`
// would differ by one character and neither name would suggest the other.
//
// NOTE: gate.mjs does NOT export LIFECYCLE_STEP because it is not bound to
// a lifecycle step — it is a query over state, not a step that mutates state.
// Consequently, tests/cli-driver-pattern.test.mjs's AST-grep does not assert
// the "requireGate first" rule against gate.mjs. The rule fires for future
// lifecycle-bound helpers extracted in the inline-node-extraction-sweep.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { currentState, isGatedStep, requireGate, resolveGateMode } from "../lifecycle-state.mjs";

// Map skill name → lifecycle step the skill ENTERS. `requireGate` then checks
// that the prior step in STEP_ORDER is completed with a passing verdict.
//
// Every value here MUST be a member of STEP_ORDER (assert with `isGatedStep`).
// `brainstorm` and `retro` used to appear with steps of the same name, neither
// of which is in STEP_ORDER: `priorStepOf` returned null for them exactly as it
// does for `specify`, so those two gates passed unconditionally while looking
// enforced. Both skills sit outside the gate chain and have no call sites, so
// they are simply absent — `adev gate require --skill brainstorm` now reports
// an unknown skill rather than silently succeeding.
const SKILL_STEP_MAP = {
  specify: "specify",
  "review-specs": "review",
  plan: "plan",
  implement: "implement",
  validate: "validate",
};

const USAGE =
  "usage: adev gate require --skill <name> --spec <path>\n" +
  "       adev gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "doctor") {
    await runDoctorSub({ projectRoot, argv: argv.slice(1) });
    return;
  }
  if (sub !== "require") {
    console.error(USAGE);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        skill: { type: "string" },
        spec: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  const { skill, spec } = parsed.values;
  if (!skill) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!spec) {
    console.error(USAGE);
    process.exit(1);
  }

  // Path containment (SEC-1 from spec review): resolve spec relative to
  // projectRoot and reject anything that escapes the project tree.
  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }

  const step = SKILL_STEP_MAP[skill];
  if (!step) {
    console.error(`unknown skill: ${skill} (no lifecycle step mapping)`);
    process.exit(1);
  }

  // Fail closed on a step that is not part of the gate chain. Without this a
  // future map entry naming a non-STEP_ORDER step would pass every gate
  // silently instead of erroring — the defect this replaces.
  if (!isGatedStep(step)) {
    console.error(
      `UNKNOWN_GATE_STEP: skill "${skill}" maps to step "${step}", which is not a ` +
        `lifecycle step. A gate cannot be evaluated for it.`,
    );
    process.exit(1);
  }

  // First lifecycle-domain statement: requireGate. State load + mode
  // resolution are inlined into the call so that requireGate(...) is the
  // single expression doing the helper's domain work (per Postcondition 1
  // of driver-substrate.spec.md and the canonical sketch in
  // research/adev-vs-compiler-dispatch-patterns.md §7.2). The manifest is
  // re-loaded here (rather than relying on the dispatcher's `manifest`
  // argument) so this helper remains testable in isolation.
  const { loadManifest } = await import("../manifest.mjs");
  requireGate(
    currentState(absRoot, absSpec),
    step,
    { mode: resolveGateMode(loadManifest(absRoot)) },
  );
  // If we reach here, the gate passes.
  process.exit(0);
}

// ── doctor sub-verb ─────────────────────────────────────────────────────────

const FAMILY_ORDER = [
  "Test collection",
  "Gate executability",
  "CI wiring",
  "Placeholders",
  "Path reachability",
];

/**
 * `adev gate doctor` — argument parsing, output formatting, exit-code mapping.
 * All diagnosis lives in lib/gates/doctor.mjs.
 */
async function runDoctorSub({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        json: { type: "boolean", default: false },
        execute: { type: "boolean", default: false },
        timeout: { type: "string" },
        gates: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  let timeoutMs;
  if (parsed.values.timeout !== undefined) {
    const seconds = Number(parsed.values.timeout);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      console.error("--timeout must be a positive number of seconds");
      process.exit(1);
    }
    timeoutMs = seconds * 1000;
  }

  const { runGateDoctor, familyOf } = await import("../gates/doctor.mjs");

  let report;
  try {
    report = await runGateDoctor({
      projectRoot: resolve(projectRoot),
      execute: parsed.values.execute,
      timeoutMs,
      gatesPath: parsed.values.gates,
    });
  } catch (err) {
    console.error(err.message ?? String(err));
    process.exit(1);
  }

  if (parsed.values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printDoctorReport(report, familyOf, parsed.values.execute);
  }

  process.exit(report.summary.errors > 0 ? 2 : 0);
}

function printDoctorReport(report, familyOf, executed) {
  console.log("# Gate Doctor");
  console.log("");
  console.log(executed ? "Mode: execute" : "Mode: static (pass --execute to run gate commands)");
  console.log("");

  if (report.findings.length === 0) {
    console.log("No findings. Every declared gate resolves and every runner reports collection.");
    return;
  }

  const grouped = new Map();
  for (const f of report.findings) {
    const family = familyOf(f.id);
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(f);
  }

  const families = [
    ...FAMILY_ORDER.filter((f) => grouped.has(f)),
    ...[...grouped.keys()].filter((f) => !FAMILY_ORDER.includes(f)),
  ];

  for (const family of families) {
    console.log(`## ${family}`);
    console.log("");
    for (const f of grouped.get(family)) {
      const mark = f.severity === "error" ? "[x]" : "[ ]";
      const where = f.citation ? ` (${f.citation})` : "";
      console.log(`- ${mark} ${f.id}: ${f.message}${where}`);
    }
    console.log("");
  }

  console.log(
    `**Summary:** ${report.summary.errors} error(s), ${report.summary.warnings} warning(s).`,
  );
}

export function help() {
  console.log("Usage: adev gate require --skill <name> --spec <path>");
  console.log("       adev gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]");
  console.log("");
  console.log("require — evaluate a lifecycle gate without performing the skill's work.");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  gate passes");
  console.log("    2  gate blocked (prior step incomplete or missing verdict)");
  console.log("    1  argument error or spec not found");
  console.log("");
  console.log("  Skills supported:");
  for (const skill of Object.keys(SKILL_STEP_MAP)) {
    console.log(`    ${skill}`);
  }
  console.log("");
  console.log("doctor  — verify that declared quality gates can actually execute and that");
  console.log("          declared test suites actually get collected. Read-only.");
  console.log("");
  console.log("  --json           emit the machine-readable envelope instead of a report");
  console.log("  --execute        run gate commands and runner collection queries");
  console.log("                   (off by default: the doctor is reachable from gates it");
  console.log("                    would otherwise re-enter)");
  console.log("  --timeout <s>    per-command budget under --execute (default 120)");
  console.log("  --gates <path>   override the gates.yaml location, project-relative");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  no error-severity findings");
  console.log("    2  one or more error-severity findings");
  console.log("    1  argument error");
}
