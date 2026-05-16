// lib/cli/verify.mjs
//
// `adev verify` — CLI surface for reality-check verification. Replaces the
// inline-Node blocks formerly embedded in:
//
//   skills/validate/SKILL.md  "Record validation outcome on issue board"
//                             (verifyIssueCompleted + formatConfidenceNote)
//   skills/hygiene/SKILL.md   "Reality drift check (codebase verification)"
//                             (verifySpecImplemented)
//
// Multi-mode verb per spec Behavior 9 — CLI-verb naming is canonical and
// shared. A single `adev verify <subcommand>` dispatches to:
//
//   spec  --spec <path>           → verifySpecImplemented(specPath, {projectRoot})
//   issue --issue-json <json>     → verifyIssueCompleted(issue, {projectRoot})
//         [--note <action>]       → also emit formatConfidenceNote on result
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: PR 7 (long-tail extraction — context/state primitives bundle)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — reality-check is observational metadata
//     used inside other lifecycle steps; it is not a step entry/exit. The
//     cli-driver pattern test does NOT assert requireGate-first on this module.
//
// CLI surface:
//   adev verify spec  --spec <path> [--plan <path>]
//   adev verify issue --issue-json <json> [--note <action>]
//   adev verify --help
//
// Exit codes (per hook protocol):
//   0  success — JSON written to stdout (regardless of pass/fail verdict;
//      a "not implemented" finding is still a successful verification)
//   1  argument error, containment violation, JSON parse error,
//      unexpected exception

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import {
  verifySpecImplemented,
  verifyIssueCompleted,
  formatConfidenceNote,
} from "../reality-check.mjs";

const USAGE = "usage: adev verify <spec|issue> [flags]";

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1, source-manifest.mjs,
 * domain.mjs, context.mjs).
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

  if (sub === "spec") {
    return await runVerifySpec({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "issue") {
    return await runVerifyIssue({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected spec or issue)`);
  process.exit(1);
}

async function runVerifySpec({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        plan: { type: "string" },
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
    console.error("  verify spec requires --spec");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) {
    console.error(`spec path escapes project root: ${v.spec}`);
    process.exit(1);
  }

  // verifySpecImplemented handles the missing-file case internally and returns
  // a structured "implemented: false, confidence: none" result — we forward
  // that as a successful verification (exit 0) per the hygiene SKILL.md
  // protocol (the caller decides what to do with confidence values).

  // Optional explicit plan path; mirrors verifySpecImplemented's option.
  const options = { projectRoot: absRoot };
  if (v.plan) {
    const absPlan = resolveContained(absRoot, v.plan);
    if (!absPlan) {
      console.error(`plan path escapes project root: ${v.plan}`);
      process.exit(1);
    }
    options.planPath = absPlan;
  }

  let result;
  try {
    result = verifySpecImplemented(absSpec, options);
  } catch (err) {
    console.error(`verify spec failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}

async function runVerifyIssue({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        "issue-json": { type: "string" },
        note: { type: "string" },
        "report-path": { type: "string" },
        "files-verified": { type: "string" },
        "tests-pass": { type: "string" },
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

  if (!v["issue-json"]) {
    console.error(USAGE);
    console.error("  verify issue requires --issue-json <json>");
    process.exit(1);
  }

  let issue;
  try {
    issue = JSON.parse(v["issue-json"]);
  } catch (err) {
    console.error(`invalid --issue-json: ${err.message ?? err}`);
    process.exit(1);
  }

  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    console.error("--issue-json must decode to a JSON object");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);

  let result;
  try {
    result = verifyIssueCompleted(issue, { projectRoot: absRoot });
  } catch (err) {
    console.error(`verify issue failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  // Optional confidence-note generation (mirrors the validate SKILL.md inline
  // block that emits `{ ...result, note }`).
  let out = result;
  if (v.note) {
    const details = {};
    if (v["report-path"]) details.reportPath = v["report-path"];
    if (v["files-verified"] !== undefined) {
      const n = Number(v["files-verified"]);
      if (Number.isFinite(n)) details.filesVerified = n;
    }
    if (v["tests-pass"] !== undefined) {
      // accept any truthy string; "false"/"0" → false
      const s = String(v["tests-pass"]).toLowerCase();
      details.testsPass = !(s === "false" || s === "0" || s === "");
    }
    const note = formatConfidenceNote(v.note, result.confidence, details);
    out = { ...result, note };
  }

  console.log(JSON.stringify(out));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev verify <spec|issue> [flags]");
  console.log("");
  console.log("Reality-check verification. Replaces the inline-Node blocks formerly");
  console.log("embedded in skills/validate (issue verification) and skills/hygiene");
  console.log("(reality drift check).");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  spec --spec <path> [--plan <path>]");
  console.log("    Verify whether the spec's implementation exists in the codebase.");
  console.log("    Delegates to verifySpecImplemented(). Inspects plan-listed files,");
  console.log("    git tracking, and test presence to compute a confidence score.");
  console.log("    Stdout: JSON { implemented, confidence, evidence }.");
  console.log("");
  console.log("  issue --issue-json <json>");
  console.log("        [--note <action>]");
  console.log("        [--report-path <path>] [--files-verified <n>] [--tests-pass <bool>]");
  console.log("    Verify whether an issue's described work is completed in the");
  console.log("    codebase. The issue object (JSON) is passed verbatim to");
  console.log("    verifyIssueCompleted(). When --note <action> is supplied, the");
  console.log("    result is augmented with a `note` field from formatConfidenceNote.");
  console.log("    Stdout: JSON { completed, confidence, reason, note? }.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success — JSON written to stdout (regardless of verdict)");
  console.log("  1  argument error, containment violation, JSON parse error,");
  console.log("     or unexpected exception");
}
