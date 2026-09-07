// lib/cli/test-debt.mjs
//
// `adev test-debt scan` — CLI surface for Audit Pass 23 (Test Debt) of
// /adev:hygiene. Surfaces five categories of accreted test-suite debt.
//
// Detection and reporting ONLY. The verb never edits, deletes, or rewrites a
// test file, never writes to the issue board, and exits 0 for any successful
// scan regardless of finding count — hygiene is advisory by design.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — an audit pass is observational, not a
//     lifecycle step entry/exit.
//
// CLI surface:
//   adev test-debt scan [--root <dir>] [--detector <CODE>] [--json]
//   adev test-debt --help
//
// Exit codes:
//   0  successful scan (findings or not), or SKIP
//   1  argument error, containment violation, invalid config, unknown detector

import { parseArgs } from "node:util";
import { resolve, relative } from "node:path";
import { existsSync } from "node:fs";
import { resolveContained } from "../path-safety.mjs";

import { runTestDebtPass, DETECTOR_CODES } from "../hygiene/test-debt.mjs";

const USAGE = "usage: adev test-debt scan [--root <dir>] [--detector <CODE>] [--json]";

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "scan") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub} (expected scan)`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        root: { type: "string" },
        detector: { type: "string" },
        json: { type: "boolean", default: false },
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

  const absRoot = resolve(projectRoot);

  let scanRoot = absRoot;
  if (v.root !== undefined) {
    const contained = resolveContained(absRoot, v.root);
    if (!contained) {
      console.error(`PATH_OUTSIDE_ROOT: --root '${v.root}' resolves outside the project root`);
      process.exit(1);
    }
    if (!existsSync(contained)) {
      console.error(`INVALID_ROOT: --root '${v.root}' does not exist`);
      process.exit(1);
    }
    scanRoot = contained;
  }

  if (v.detector !== undefined && !DETECTOR_CODES.includes(v.detector)) {
    console.error(`UNKNOWN_DETECTOR: '${v.detector}' — valid codes: ${DETECTOR_CODES.join(", ")}`);
    process.exit(1);
  }

  let result;
  try {
    result = runTestDebtPass(absRoot, {
      scanRoot,
      detector: v.detector,
      ...(manifest !== undefined ? { manifest } : {}),
    });
  } catch (err) {
    if (err && err.code === "INVALID_TEST_DEBT_CONFIG") {
      console.error(`INVALID_TEST_DEBT_CONFIG: ${err.message}`);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  if (v.json) {
    console.log(JSON.stringify(result));
    return;
  }

  renderHuman(result, absRoot, scanRoot);
}

function renderHuman(result, absRoot, scanRoot) {
  const scope = scanRoot === absRoot ? "." : relative(absRoot, scanRoot);
  console.log(`Test Debt — ${result.verdict} (scanned ${result.scannedFileCount} test files under ${scope}/)`);

  for (const note of result.headerNotes) console.log(`  note: ${note}`);

  if (result.verdict === "SKIP") {
    console.log(`  skipped: ${result.summary.reason}`);
    return;
  }
  if (result.findings.length === 0) {
    console.log("  No test-debt candidates found.");
    return;
  }

  for (const code of DETECTOR_CODES) {
    const group = result.findings.filter((f) => f.code === code);
    if (group.length === 0) continue;
    console.log("");
    console.log(`## ${code} — ${group.length} candidate${group.length === 1 ? "" : "s"}`);
    for (const f of group) {
      const detail =
        f.code === "APPEND_CHAIN"
          ? `${f.count} test files`
          : f.code === "PROSE_ASSERTION"
            ? `ratio ${f.ratio} (${f.numerator}/${f.denominator})`
            : f.code === "PLAN_TASK_STRUCTURED"
              ? `${f.count} title${f.count === 1 ? "" : "s"}`
              : f.code === "DEAD_TEST_REFERENCE"
                ? `-> ${f.target}`
                : "";
      console.log(`  [${f.severity}] ${f.path}${detail ? ` — ${detail}` : ""}`);
      if (f.samples && f.samples.length > 0) {
        for (const s of f.samples) console.log(`         ${s}`);
        if (f.more) console.log(`         … and ${f.more} more`);
      }
    }
  }

  console.log("");
  console.log("These are heuristic candidates for human review, not defects. Hygiene is advisory.");
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Audit Pass 23 (Test Debt) of /adev:hygiene. Surfaces accreted test-suite debt.");
  console.log("Detection and reporting only — never edits, deletes, or rewrites a test file.");
  console.log("");
  console.log("Subcommands:");
  console.log("  scan                    Run the pass over the project's test suite");
  console.log("");
  console.log("Flags:");
  console.log("  --root <dir>            Narrow the scan subtree (must be inside the project root).");
  console.log("                          Does NOT establish the project root.");
  console.log("  --detector <CODE>       Run one detector only. Valid codes:");
  console.log(`                          ${DETECTOR_CODES.join(", ")}`);
  console.log("  --json                  Emit the result object as a single JSON document");
  console.log("");
  console.log("Configuration: manifest.yaml `hygiene.test_debt` (all keys optional).");
  console.log("  enabled, test_globs, exclude, append_chain_threshold,");
  console.log("  prose_ratio_threshold, rev_numbered_prefixes");
  console.log("");
  console.log("Note: hygiene.coverage_exclude is deliberately NOT applied — that key exists");
  console.log("for codehealth's orphan detection and is why test debt is invisible today.");
}
