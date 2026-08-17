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
import { resolve } from "node:path";
import { resolveContained } from "../path-safety.mjs";

import {
  verifySpecImplemented,
  verifyIssueCompleted,
  formatConfidenceNote,
} from "../reality-check.mjs";
import { hasDrift } from "../spec-drift.mjs";
import { readEvents } from "../lifecycle-state.mjs";

const USAGE = "usage: adev verify <spec|issue|format-note> [flags]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "spec") {
    return await runVerifySpec({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "format-note") {
    return runFormatNote({ argv: argv.slice(1) });
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
        "check-drift": { type: "boolean", default: false },
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

  // --check-drift: report on the spec's drift_detected frontmatter flag
  // instead of running verifySpecImplemented. Used by skills/validate
  // Check 1.6 to surface code-side drift warnings.
  if (v["check-drift"]) {
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
    let drifted;
    try {
      drifted = await hasDrift(absSpec);
    } catch (err) {
      console.error(`drift check failed: ${err && err.message ? err.message : err}`);
      process.exit(1);
    }
    // Per jsonl-drift-events.spec.md Behavior 5 + Migration Step 2:
    // drift_source / drift_at come from the latest unresolved
    // code_drift_detected event in the spec's JSONL. A later
    // code_drift_cleared event supersedes prior code_drift_detected events.
    // Legacy fallback: if drifted is true but JSONL has no matching event
    // (pre-migration specs), both fields are null.
    let driftSource = null;
    let driftAt = null;
    if (drifted) {
      try {
        const events = readEvents(absRoot, absSpec);
        // Find the latest event that is either code_drift_detected or
        // code_drift_cleared; if it is detected, that is the unresolved
        // signal. Order-preserving scan from end is O(N) at most and short-
        // circuits on the first relevant variant.
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i];
          if (ev.event === "code_drift_cleared") {
            // The most recent drift event was a clear — nothing to report.
            break;
          }
          if (ev.event === "code_drift_detected") {
            driftSource = typeof ev.drift_source === "string" ? ev.drift_source : null;
            driftAt = typeof ev.drift_at === "string" ? ev.drift_at : null;
            break;
          }
        }
      } catch {
        // ignore — drifted is still true; legacy fallback (null fields).
      }
    }
    console.log(JSON.stringify({ drifted, drift_source: driftSource, drift_at: driftAt }));
    process.exit(0);
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

function runFormatNote({ argv }) {
  // Thin wrapper around `formatConfidenceNote(action, confidence, details)`.
  // Used by skills/debug Phase 6 (manual close after a fix).
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        action: { type: "string" },
        confidence: { type: "string" },
        "spec-path": { type: "string" },
        "report-path": { type: "string" },
        "files-verified": { type: "string" },
        "tests-pass": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error("usage: adev verify format-note --action <text> --confidence <low|medium|high> [flags]");
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.action) {
    console.error("usage: adev verify format-note --action <text> --confidence <low|medium|high>");
    console.error("  missing --action");
    process.exit(1);
  }
  if (!v.confidence) {
    console.error("usage: adev verify format-note --action <text> --confidence <low|medium|high>");
    console.error("  missing --confidence");
    process.exit(1);
  }
  if (!["low", "medium", "high"].includes(v.confidence)) {
    console.error(
      `--confidence must be one of: low, medium, high (got ${JSON.stringify(v.confidence)})`,
    );
    process.exit(1);
  }

  const details = {};
  if (v["spec-path"]) details.specPath = v["spec-path"];
  if (v["report-path"]) details.reportPath = v["report-path"];
  if (v["files-verified"] !== undefined) {
    const n = Number(v["files-verified"]);
    if (Number.isFinite(n)) details.filesVerified = n;
  }
  if (v["tests-pass"] !== undefined) {
    const s = String(v["tests-pass"]).toLowerCase();
    details.testsPass = !(s === "false" || s === "0" || s === "");
  }

  const note = formatConfidenceNote(v.action, v.confidence, details);
  console.log(JSON.stringify({ note }));
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
  console.log("Usage: adev verify <spec|issue|format-note> [flags]");
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
  console.log("  format-note --action <text> --confidence <low|medium|high>");
  console.log("              [--spec-path <p>] [--report-path <p>] [--files-verified <n>]");
  console.log("              [--tests-pass <bool>]");
  console.log("    Format a confidence-annotated note WITHOUT running an inspection.");
  console.log("    Used by skills that have already verified the work (e.g., debug");
  console.log("    Phase 6 manual close). Delegates to formatConfidenceNote().");
  console.log("    Stdout: JSON { note }.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success — JSON written to stdout (regardless of verdict)");
  console.log("  1  argument error, containment violation, JSON parse error,");
  console.log("     or unexpected exception");
}
