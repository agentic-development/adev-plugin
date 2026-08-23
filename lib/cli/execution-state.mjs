// lib/cli/execution-state.mjs
//
// `adev execution-state` — CLI surface for `.context-index/.execution-state.json`
// read/write/clear.
//
// Multi-mode verb per spec Behavior 9 — CLI-verb naming is canonical and
// shared. A single `adev execution-state <subcommand>` dispatches:
//
//   read                                 — read current state, emit JSON
//   write [flags…]                       — write new state (status + bindings)
//   clear                                — reset state to idle
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — execution-state is an operational
//     metadata file inside other lifecycle steps; reading/writing it does
//     not constitute a step entry/exit.
//
// CLI surface:
//   adev execution-state read
//   adev execution-state write --status <s> [--plan-ref <p>] [--current-task <t>]
//                              [--issue-binding <id>] [--blockers <s>]
//                              [--next-action <s>] [--progress-json <json>]
//   adev execution-state clear
//   adev execution-state --help
//
// Exit codes:
//   0  success — JSON on stdout for `read` and `write`; empty for `clear`
//   1  argument error, validation failure, unexpected exception

import { parseArgs } from "node:util";

import {
  readExecutionState,
  writeExecutionState,
  clearExecutionState,
} from "../execution-state.mjs";

const USAGE = "usage: adev execution-state <read|write|clear> [flags]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "read") {
    return await runRead({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "write") {
    return await runWrite({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "clear") {
    return await runClear({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected read, write, or clear)`);
  process.exit(1);
}

async function runRead({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { help: { type: "boolean", default: false } },
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
    state = readExecutionState(projectRoot);
  } catch (err) {
    if (err && (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_STORAGE_PATH")) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(
      `execution-state read failed: ${err && err.message ? err.message : err}`,
    );
    process.exit(1);
  }

  // readExecutionState returns null for missing/malformed/oversized files.
  // Mirror that as `null` in JSON so callers can distinguish "no state" from
  // an active state.
  console.log(JSON.stringify(state));
  process.exit(0);
}

async function runWrite({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        status: { type: "string" },
        "plan-ref": { type: "string" },
        "current-task": { type: "string" },
        "issue-binding": { type: "string" },
        blockers: { type: "string" },
        "next-action": { type: "string" },
        "progress-json": { type: "string" },
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

  if (!v.status) {
    console.error(USAGE);
    console.error("  write requires --status (one of idle|active|blocked|standalone)");
    process.exit(1);
  }

  const state = { status: v.status };
  if (v["plan-ref"] !== undefined) state.planRef = v["plan-ref"];
  if (v["current-task"] !== undefined) {
    // Coerce numeric-string currentTask to Number to match readExecutionState's
    // round-trip normalization.
    if (/^\d+$/.test(v["current-task"])) {
      state.currentTask = Number(v["current-task"]);
    } else {
      state.currentTask = v["current-task"];
    }
  }
  if (v["issue-binding"] !== undefined) state.issueBinding = v["issue-binding"];
  if (v.blockers !== undefined) state.blockers = v.blockers;
  if (v["next-action"] !== undefined) state.nextAction = v["next-action"];
  if (v["progress-json"] !== undefined) {
    let progress;
    try {
      progress = JSON.parse(v["progress-json"]);
    } catch (err) {
      console.error(`invalid --progress-json: ${err.message ?? err}`);
      process.exit(1);
    }
    if (!Array.isArray(progress)) {
      console.error("--progress-json must decode to a JSON array");
      process.exit(1);
    }
    state.progress = progress;
  }

  try {
    writeExecutionState(projectRoot, state);
  } catch (err) {
    if (
      err &&
      (err.code === "INVALID_PROJECT_ROOT" ||
        err.code === "INVALID_STORAGE_PATH" ||
        err.code === "INVALID_STATUS" ||
        err.code === "MISSING_PLAN_REF" ||
        err.code === "MISSING_CURRENT_TASK")
    ) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(
      `execution-state write failed: ${err && err.message ? err.message : err}`,
    );
    process.exit(1);
  }

  // Echo the written state on stdout so callers can chain. readExecutionState
  // is the source of truth; reading back ensures the round-trip shape.
  let readBack;
  try {
    readBack = readExecutionState(projectRoot);
  } catch {
    readBack = null;
  }
  console.log(JSON.stringify(readBack));
  process.exit(0);
}

async function runClear({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { help: { type: "boolean", default: false } },
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

  try {
    clearExecutionState(projectRoot);
  } catch (err) {
    if (
      err &&
      (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_STORAGE_PATH")
    ) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(
      `execution-state clear failed: ${err && err.message ? err.message : err}`,
    );
    process.exit(1);
  }

  // No stdout — `clear` is a silent operation per the cli-driver pattern
  // (silent stdout on success).
  process.exit(0);
}

export function help() {
  console.log("Usage: adev execution-state <subcommand> [flags]");
  console.log("");
  console.log("Read/write/clear `.context-index/.execution-state.json` — the live");
  console.log("snapshot of current work in progress. Replaces the prose-form inline");
  console.log("Node references formerly embedded in skills/implement (writeExecutionState,");
  console.log("clearExecutionState).");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  read");
  console.log("    Read the current execution-state file. Stdout: JSON object");
  console.log("    matching `readExecutionState()` return shape, or `null` when");
  console.log("    no state is present.");
  console.log("");
  console.log("  write --status <s> [flags]");
  console.log("    Write a new execution state. Status must be one of:");
  console.log("      idle | active | blocked | standalone");
  console.log("    Active state additionally requires --plan-ref and --current-task.");
  console.log("    Flags:");
  console.log("      --plan-ref <path>          Active-state plan file");
  console.log("      --current-task <id>        Current task identifier");
  console.log("      --issue-binding <id>       Issue board binding");
  console.log("      --blockers <text>          Blocker description (status=blocked)");
  console.log("      --next-action <text>       Operator-facing next action hint");
  console.log("      --progress-json <json>     JSON array of progress items");
  console.log("    Stdout: JSON of the written-then-re-read state.");
  console.log("");
  console.log("  clear");
  console.log("    Reset execution state to idle. Silent on success.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument error, validation failure, INVALID_PROJECT_ROOT,");
  console.log("     INVALID_STORAGE_PATH, INVALID_STATUS, MISSING_PLAN_REF,");
  console.log("     MISSING_CURRENT_TASK, or unexpected exception");
}
