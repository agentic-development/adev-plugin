// lib/cli/build-state.mjs
//
// `adev build-state` — CLI surface for `.context-index/lifecycle-state/<slug>.json`
// build-orchestrator resume state. Replaces the three inline-Node heredocs
// formerly embedded in skills/build/SKILL.md:
//
//   line 236: dispatch-loop read-or-create + getNextStep
//   line 254: recordStepResult (status='skipped') + re-read + getNextStep
//   line 272: recordStepResult (completed/failed) + getNextStep
//
// Multi-mode verb. A single `adev build-state <subcommand>` dispatches:
//
//   read   --spec <p>                            — read existing state (null when absent)
//   create --spec <p> [--milestone <m>] [--full] — create fresh state
//   record --spec <p> --step <name> --status <s> — record a step result
//          [--verdict <v>] [--error <e>] [--notes <n>] [--retry-history-json <json>]
//   next   --spec <p>                            — read state + compute next step
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: PR 7 (long-tail extraction — context/state primitives bundle)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — build-state is operational metadata,
//     not a step entry/exit.
//
// Exit codes:
//   0  success — JSON on stdout
//   1  argument error, NO_BUILD_STATE, INVALID_STEP_STATUS, UNKNOWN_STEP,
//      INVALID_PROJECT_ROOT, or unexpected exception

import { parseArgs } from "node:util";
import { isAbsolute, resolve, sep } from "node:path";

import {
  readBuildState,
  createBuildState,
  recordStepResult,
  getNextStep,
} from "../build-state.mjs";

const USAGE = "usage: adev build-state <read|create|record|next> --spec <p> [flags]";

function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

/**
 * Shared argv parser that always accepts --spec. Sub-commands extend the
 * option set; the shared parser exists so we can produce a consistent
 * "missing --spec" error.
 */
function parseSpec(argv) {
  // Use a permissive parser here — we re-parse with mode-specific options in
  // each handler. The only invariant we enforce up-front is that --spec was
  // supplied.
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--spec" && i + 1 < argv.length) {
      return { spec: argv[i + 1] };
    }
  }
  return { spec: null };
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (!["read", "create", "record", "next"].includes(sub)) {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub} (expected read, create, record, or next)`);
    process.exit(1);
  }

  // Allow --help on the subcommand even without --spec.
  if (argv.includes("--help") || argv.includes("-h")) {
    help();
    process.exit(0);
  }

  const { spec } = parseSpec(argv.slice(1));
  if (!spec) {
    console.error(USAGE);
    console.error(`  ${sub} requires --spec`);
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absSpec = resolveContained(absRoot, spec);
  if (!absSpec) {
    console.error(`spec path escapes project root: ${spec}`);
    process.exit(1);
  }
  // build-state's resolveStatePath builds a slug from the basename, so we can
  // pass either absolute or relative; pass through what was given.

  if (sub === "read") return await runRead({ absRoot, spec, argv: argv.slice(1) });
  if (sub === "create") return await runCreate({ absRoot, spec, argv: argv.slice(1) });
  if (sub === "record") return await runRecord({ absRoot, spec, argv: argv.slice(1) });
  if (sub === "next") return await runNext({ absRoot, spec, argv: argv.slice(1) });
}

async function runRead({ absRoot, spec, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }

  let state;
  try {
    state = readBuildState(absRoot, spec);
  } catch (err) {
    console.error(`build-state read failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  console.log(JSON.stringify(state));
  process.exit(0);
}

async function runCreate({ absRoot, spec, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        milestone: { type: "string" },
        full: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }

  const options = { full: !!parsed.values.full };
  if (parsed.values.milestone !== undefined) {
    options.milestone = parsed.values.milestone;
  } else {
    options.milestone = null;
  }

  let state;
  try {
    state = createBuildState(absRoot, spec, options);
  } catch (err) {
    if (err && err.code === "INVALID_PROJECT_ROOT") {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`build-state create failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  console.log(JSON.stringify(state));
  process.exit(0);
}

async function runRecord({ absRoot, spec, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        step: { type: "string" },
        status: { type: "string" },
        verdict: { type: "string" },
        error: { type: "string" },
        notes: { type: "string" },
        "retry-history-json": { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }

  const v = parsed.values;
  if (!v.step) {
    console.error(USAGE);
    console.error("  record requires --step <name>");
    process.exit(1);
  }
  if (!v.status) {
    console.error(USAGE);
    console.error("  record requires --status <completed|failed|skipped|pending>");
    process.exit(1);
  }

  const result = { status: v.status };
  if (v.verdict !== undefined) result.verdict = v.verdict;
  if (v.error !== undefined) result.error = v.error;
  if (v.notes !== undefined) result.notes = v.notes;
  if (v["retry-history-json"] !== undefined) {
    let retryHistory;
    try {
      retryHistory = JSON.parse(v["retry-history-json"]);
    } catch (err) {
      console.error(`invalid --retry-history-json: ${err.message ?? err}`);
      process.exit(1);
    }
    if (!Array.isArray(retryHistory)) {
      console.error("--retry-history-json must decode to a JSON array");
      process.exit(1);
    }
    result.retryHistory = retryHistory;
  }

  let updated;
  try {
    updated = recordStepResult(absRoot, spec, v.step, result);
  } catch (err) {
    if (
      err &&
      (err.code === "NO_BUILD_STATE" ||
        err.code === "INVALID_STEP_STATUS" ||
        err.code === "UNKNOWN_STEP" ||
        err.code === "INVALID_PROJECT_ROOT")
    ) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`build-state record failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  console.log(JSON.stringify(updated));
  process.exit(0);
}

async function runNext({ absRoot, spec, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        help: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    if (err && err.message) console.error(`  ${err.message}`);
    process.exit(1);
  }
  if (parsed.values.help) {
    help();
    process.exit(0);
  }

  let state;
  try {
    state = readBuildState(absRoot, spec);
  } catch (err) {
    console.error(`build-state next failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  const next = getNextStep(state);
  // Emit { state, next } so callers can chain — mirrors the original inline
  // block at skills/build/SKILL.md line 236.
  console.log(JSON.stringify({ state, next }));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev build-state <subcommand> --spec <path> [flags]");
  console.log("");
  console.log("Read/create/record/next over `.context-index/lifecycle-state/<slug>.json`,");
  console.log("the build-orchestrator resume state. Replaces the three inline-Node");
  console.log("heredocs formerly embedded in skills/build/SKILL.md.");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  read --spec <p>");
  console.log("    Read build state for the spec. Stdout: JSON state object or `null`.");
  console.log("");
  console.log("  create --spec <p> [--milestone <m>] [--full]");
  console.log("    Create a fresh build state with all steps pending. --full");
  console.log("    includes the 'specify' step (Full Pipeline). Stdout: created state.");
  console.log("");
  console.log("  record --spec <p> --step <name> --status <s> [flags]");
  console.log("    Record a step result. Status: completed | failed | skipped | pending.");
  console.log("    Flags:");
  console.log("      --verdict <v>              Skill-specific outcome (PASS, BLOCK, etc.)");
  console.log("      --error <e>                Error details for failed steps");
  console.log("      --notes <n>                Optional notes");
  console.log("      --retry-history-json <a>   JSON array of retry attempts");
  console.log("    Stdout: updated state.");
  console.log("");
  console.log("  next --spec <p>");
  console.log("    Read state + compute next pending step. Stdout: JSON");
  console.log("      { state, next: {name, index}|null }.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument error, NO_BUILD_STATE, INVALID_STEP_STATUS,");
  console.log("     UNKNOWN_STEP, INVALID_PROJECT_ROOT, or unexpected exception");
}
