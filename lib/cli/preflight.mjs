// lib/cli/preflight.mjs
//
// `adev preflight run` — CLI surface for `runPreflight` +
// `formatPreflightReport` from `lib/infra-preflight.mjs`.
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// PR 8-9: long-tail extraction. Replaces inline preflight blocks in
//   - skills/write-test/SKILL.md (Step 1a)
//   - skills/eval/SKILL.md (Preflight)
//   - skills/debug/SKILL.md (Phase 1.5)
//   - skills/recover/SKILL.md (Step 1.5)
//   - skills/implement/SKILL.md (Step 1.5)
//   - skills/validate/SKILL.md (Preflight)
//   - skills/brainstorm/SKILL.md (none currently — but available)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP. Preflight is an observational helper
//     invoked from inside multiple lifecycle skills; it is not itself a
//     step entry/exit. The cli-driver pattern test will NOT assert
//     requireGate-first on this module.
//
// Exit codes:
//   0  preflight passed OR skipped (--no-infra)
//   1  argument error or spec/plan containment failure
//   2  preflight failed (one or more systems unreachable). Callers reading
//      the JSON / formatted output decide how to surface this. Exit 2 lets
//      the caller distinguish "failed" from "argument error".
//
// CLI surface:
//   adev preflight run --spec <path>
//                      [--plan <path>]
//                      [--timeout <seconds>]
//                      [--no-infra]
//                      [--format json|text]   (default: json)
//
// Stdout:
//   --format json (default): single JSON object — the `runPreflight` return
//                            value, including `passed`, `systems`, `skipped`,
//                            `env_file`, `env_loaded`, `env_warning`.
//   --format text: human-readable markdown report from
//                  `formatPreflightReport(report)`.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { runPreflight, formatPreflightReport } from "../infra-preflight.mjs";

const USAGE =
  "usage: adev preflight run --spec <path> [--plan <path>] [--timeout <sec>] [--no-infra] [--format json|text]";

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

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "run") {
    console.error(USAGE);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        plan: { type: "string" },
        timeout: { type: "string" },
        "no-infra": { type: "boolean", default: false },
        format: { type: "string", default: "json" },
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

  if (!v.spec) {
    console.error(USAGE);
    console.error("  missing --spec");
    process.exit(1);
  }

  if (v.format !== "json" && v.format !== "text") {
    console.error(`--format must be one of: json, text (got ${JSON.stringify(v.format)})`);
    process.exit(1);
  }

  let timeoutSec = 10;
  if (v.timeout !== undefined) {
    const n = Number(v.timeout);
    if (!Number.isFinite(n) || n <= 0) {
      console.error(`--timeout must be a positive number (got ${JSON.stringify(v.timeout)})`);
      process.exit(1);
    }
    timeoutSec = n;
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

  let absPlan = null;
  if (v.plan !== undefined && v.plan !== null && v.plan !== "") {
    absPlan = resolveContained(absRoot, v.plan);
    if (!absPlan) {
      console.error(`plan not found: ${v.plan}`);
      process.exit(1);
    }
    if (!existsSync(absPlan)) {
      console.error(`plan not found: ${v.plan}`);
      process.exit(1);
    }
  }

  // ── Delegate to runPreflight ────────────────────────────────────────────
  let report;
  try {
    report = await runPreflight(absSpec, absPlan, {
      timeout: timeoutSec,
      noInfra: v["no-infra"] === true,
      projectRoot: absRoot,
    });
  } catch (err) {
    // Most preflight errors are surfaced as report.passed === false; only
    // hard exceptions (e.g., PREFLIGHT_UNSAFE_ENV_FILE) reach here.
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  // ── Emit ────────────────────────────────────────────────────────────────
  if (v.format === "text") {
    console.log(formatPreflightReport(report));
  } else {
    console.log(JSON.stringify(report));
  }

  process.exit(report.passed === false ? 2 : 0);
}

export function help() {
  console.log("Usage: adev preflight run --spec <path> [--plan <path>]");
  console.log("                          [--timeout <sec>] [--no-infra]");
  console.log("                          [--format json|text]");
  console.log("");
  console.log("Run the infrastructure preflight against a spec and (optional) plan.");
  console.log("Wraps lib/infra-preflight.mjs::runPreflight + formatPreflightReport.");
  console.log("");
  console.log("Required:");
  console.log("  --spec <path>     Live Spec file (project-relative or absolute)");
  console.log("");
  console.log("Optional:");
  console.log("  --plan <path>     Plan file (same dir as spec by convention)");
  console.log("  --timeout <sec>   Per-system probe timeout in seconds (default: 10)");
  console.log("  --no-infra        Skip the preflight (user-only — exits 0)");
  console.log("  --format <fmt>    Output format: json (default) | text");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  preflight passed (or skipped via --no-infra)");
  console.log("  1  argument error or spec/plan not found");
  console.log("  2  preflight FAILED (one or more systems unreachable)");
}
