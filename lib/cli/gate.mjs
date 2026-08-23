// lib/cli/gate.mjs
//
// adev gate require     --skill <name> --spec <path>
// adev gate doctor      [--json] [--execute] [--timeout <s>] [--gates <path>]
// adev gate transitions --transition <name> --spec <path> [--json]
//                       [--module <slug>] [--charter <path>] [--gates <path>]
//
// Three query primitives over gates, none of which performs side-effecting
// work:
//
//   require — evaluates a LIFECYCLE gate for a spec. Exit codes:
//     0  gate passes (prior step complete with PASS or PASS_WITH_NOTES verdict)
//     2  gate blocked (GateError, per hook protocol)
//     1  argument error or spec not found
//
//   doctor  — diagnoses whether the QUALITY gates a project declares can
//             actually execute, and whether its tests actually get collected.
//     0  no error-severity finding
//     2  one or more error-severity findings
//     1  argument error
//
//   transitions — compares a lifecycle transition's `required_gates` against
//             the `gate_outcomes` recorded on a spec's lifecycle log. Reads
//             history only: it never executes a gate (that is validate's
//             Check 1) and never evaluates a workflow precondition (that is
//             `require`). All logic lives in lib/governance/transitions.mjs.
//     0  transition passes, or nothing was configured to check (SKIP)
//     2  a required gate has no fresh, attested, passing outcome
//     1  argument error, spec not found, OR a project the comparator cannot
//        read: GATES_PARSE_ERROR, GATES_PATH_ESCAPE, GOVERNANCE_READ_ERROR,
//        MANIFEST_PARSE_ERROR, INVALID_DOMAIN_NAME and friends. Under --json
//        that path emits {transition, error, code} so a Check 9 body parsing
//        stdout gets a diagnosis rather than empty output.
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
  "       adev gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]\n" +
  "       adev gate transitions --transition <name> --spec <path> [--json] [--gates <path>]\n" +
  "                             [--module <slug>] [--charter <path>]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "doctor") {
    await runDoctorSub({ projectRoot, argv: argv.slice(1) });
    return;
  }
  if (sub === "transitions") {
    await runTransitionsSub({ projectRoot, argv: argv.slice(1) });
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

  const absRoot = resolve(projectRoot);
  const absSpec = resolveSpecOrExit(absRoot, spec);

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

/**
 * Path containment (SEC-1 from spec review): resolve `spec` relative to
 * `absRoot` and reject anything that escapes the project tree, then require the
 * file to exist. Both failures report the same "spec not found" message so an
 * out-of-tree probe learns nothing an in-tree miss would not have told it.
 *
 * @param {string} absRoot Absolute project root.
 * @param {string} spec Spec path as supplied on the command line.
 * @returns {string} The contained absolute spec path.
 */
function resolveSpecOrExit(absRoot, spec) {
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  return absSpec;
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

// ── transitions sub-verb ────────────────────────────────────────────────────

/**
 * Resolve the domain the transition comparator must compare against, using the
 * SAME precedence `adev domain load-gates` uses: charter > module > project >
 * `software` (lib/domains/resolve.mjs). Sharing `readFrontmatter` with
 * `lib/cli/domain.mjs` rather than re-reading frontmatter here is deliberate —
 * a second parser is exactly how the two views drift apart.
 *
 * Scope no longer changes WHICH GATES LOAD. Task 11 removed the run-time
 * domain overlay, so the gate set is the project's materialized
 * `governance/gates.yaml` whatever the resolved domain is. What scope still
 * decides is the `domain` LABEL reported alongside the outcome, and that label
 * must match the one Check 1 recorded under: a mismatch degrades every recorded
 * outcome to `unattested-gate-record` — a permanent FAIL with no diagnosis
 * attached. So resolve it the same way Check 1 did; do not assume the choice is
 * now inert.
 *
 * With neither flag the project level is the documented default: the domain
 * comes from `manifest.project.domain`, else `software`.
 *
 * @param {string} absRoot
 * @param {string|undefined} moduleSlug
 * @param {string|undefined} charterPath
 * @returns {Promise<object>} `resolveDomain`'s return shape.
 */
async function resolveTransitionDomain(absRoot, moduleSlug, charterPath) {
  const [{ resolveDomain }, { readFrontmatter }, { loadManifest }] = await Promise.all([
    import("../domains/resolve.mjs"),
    import("./domain.mjs"),
    import("../manifest.mjs"),
  ]);

  let charterFrontmatter = null;
  if (charterPath !== undefined) {
    const absCharter = isAbsolute(charterPath) ? charterPath : resolve(absRoot, charterPath);
    if (absCharter !== absRoot && !absCharter.startsWith(absRoot + sep)) {
      console.error(`charter path escapes project root: ${charterPath}`);
      process.exit(1);
    }
    if (!existsSync(absCharter)) {
      console.error(`charter not found: ${charterPath}`);
      process.exit(1);
    }
    charterFrontmatter = readFrontmatter(absCharter);
  }

  return resolveDomain(loadManifest(absRoot), charterFrontmatter, moduleSlug ?? null);
}

/**
 * `adev gate transitions` — argument parsing, output formatting, exit-code
 * mapping. All comparison lives in lib/governance/transitions.mjs.
 *
 * Exit codes follow that module's documented convention: 0 for PASS and SKIP
 * (a SKIP is "nothing was configured to check", which must not block), 2 for
 * FAIL, 1 for an argument error or a project the comparator cannot read.
 */
async function runTransitionsSub({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        transition: { type: "string" },
        spec: { type: "string" },
        json: { type: "boolean", default: false },
        gates: { type: "string" },
        module: { type: "string" },
        charter: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  const { transition, spec } = parsed.values;
  if (!transition) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!spec) {
    console.error(USAGE);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  resolveSpecOrExit(absRoot, spec);

  // Domain resolution can throw INVALID_DOMAIN_NAME on a malformed manifest;
  // that is a project-config error and belongs on the same exit-1 envelope as
  // the comparator's own.
  const { evaluateTransitions } = await import("../governance/transitions.mjs");

  let result;
  try {
    const domain = await resolveTransitionDomain(
      absRoot,
      parsed.values.module,
      parsed.values.charter,
    );
    result = evaluateTransitions(absRoot, spec, {
      transition,
      gatesPath: parsed.values.gates,
      moduleSlug: parsed.values.module ?? null,
      domain,
    });
  } catch (err) {
    const message = err?.message ?? String(err);
    if (parsed.values.json) {
      // A Check 9 body parsing stdout must be able to tell a broken project
      // from a broken flag. Silence on this path is indistinguishable from a
      // crash, so emit the envelope before exiting.
      console.log(JSON.stringify({ transition, error: message, code: err?.code ?? null }, null, 2));
    }
    console.error(message);
    process.exit(1);
  }

  if (parsed.values.json) {
    console.log(JSON.stringify({ transition, ...result }, null, 2));
  } else {
    printTransitionsReport(transition, result);
  }

  process.exit(result.verdict === "FAIL" ? 2 : 0);
}

function printTransitionsReport(transition, result) {
  console.log(`# Transition Gates: ${transition}`);
  console.log("");
  console.log(`${result.verdict}: ${result.reason}`);
  const ids = Object.keys(result.gates);
  if (ids.length === 0) return;
  console.log("");
  for (const id of ids) {
    const g = result.gates[id];
    const mark = g.verdict === "pass" ? "[x]" : "[ ]";
    const attested = g.command_attested ? "" : " (command not attested)";
    console.log(`- ${mark} ${id}: ${g.verdict} — ${g.reason}${attested}`);
  }
}

export function help() {
  console.log("Usage: adev gate require --skill <name> --spec <path>");
  console.log("       adev gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]");
  console.log(
    "       adev gate transitions --transition <name> --spec <path> [--json] [--gates <path>]",
  );
  console.log("                             [--module <slug>] [--charter <path>]");
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
  console.log("");
  console.log("transitions — check a lifecycle transition's required_gates against the");
  console.log("          gate_outcomes recorded on a spec's lifecycle log. Reads history");
  console.log("          only: it never runs a gate and never checks a workflow");
  console.log("          precondition (use `gate require` for that).");
  console.log("");
  console.log("  --transition <n> transition name from governance/gates.yaml");
  console.log("                   (e.g. implement-to-validate)");
  console.log("  --spec <path>    spec whose lifecycle log carries the outcomes");
  console.log("  --json           emit the machine-readable envelope instead of a report");
  console.log("  --gates <path>   override the gates.yaml location, project-relative");
  console.log("  --module <slug>  module slug for domain resolution — MUST name the same");
  console.log("                   scope Check 1 ran under, or the resolved gate set");
  console.log("                   differs and every outcome reads as unattested");
  console.log("  --charter <path> charter whose frontmatter names the domain (wins over");
  console.log("                   --module, as in `adev domain load-gates`)");
  console.log("                   With neither flag the domain resolves at the PROJECT");
  console.log("                   level (manifest.project.domain, else 'software').");
  console.log("");
  console.log("  A gate counts only when its recorded outcome is FRESH (the event's ts is");
  console.log("  at or after the spec's source-manifest computed-at, and any recorded");
  console.log("  manifest_sha matches the spec's current sha) and ATTESTED (the gate is");
  console.log("  declared in the resolved gate set, and any recorded command_sha matches");
  console.log("  the hash of its resolved argv). The attestation is partial: command_sha");
  console.log("  catches drift, and catches copying between gates whose resolved argv");
  console.log("  DIFFER. Two gates resolving to the same command share a digest, so an");
  console.log("  outcome copied between them still attests. It catches no deliberate");
  console.log("  forgery at all.");
  console.log("");
  console.log("  A spec carrying no source-manifest stamp reports no-manifest-stamp (not");
  console.log("  stale-gate-record) and SKIPs the transition: an unstamped spec has never");
  console.log("  completed implementation, so it owes no recorded outcomes. Stamp it");
  console.log("  (/adev:implement) to get a real verdict.");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  transition passes, or no transitions are configured (SKIP)");
  console.log("    2  a required gate has no fresh, attested, passing outcome");
  console.log("    1  argument error, spec not found, or a project the comparator cannot");
  console.log("       read — GATES_PARSE_ERROR, GATES_PATH_ESCAPE, GOVERNANCE_READ_ERROR,");
  console.log("       MANIFEST_PARSE_ERROR, INVALID_DOMAIN_NAME. Under --json this path");
  console.log("       emits {transition, error, code} on stdout as well as stderr.");
}
