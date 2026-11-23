// adev decisions pending --spec <path> [--json]
// adev decisions record  --spec <path> --answers <json-or-@path> [--json]
//
// Contract (driver-substrate): exports `run({ projectRoot, argv })` and `help()`.
//
// Exit codes:
//   0  result printed (advisories never fail the verb)
//   1  argument error, or a coded error from lib/decisions.mjs printed as
//      "<CODE>: <message>" (messages never echo file or answer content)

import { parseArgs } from "node:util";
import { resolve } from "node:path";

import { computePending, readAnswersInput, recordDecisions } from "../decisions.mjs";

const USAGE = [
  "usage: adev decisions pending --spec <path> [--json]",
  "       adev decisions record --spec <path> --answers <json-or-@path> [--json]",
].join("\n");

function usageError(detail) {
  console.error(USAGE);
  if (detail) console.error(`  ${detail}`);
  process.exit(1);
}

function fatal(err) {
  if (err && typeof err.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(err.code)) {
    console.error(`${err.code}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

function printPending(result) {
  for (const item of result.pending) {
    console.log(`${item.blocker_id} [${item.header}] ${item.question}`);
    for (const o of item.options) {
      console.log(o.implications ? `  - ${o.label}: ${o.implications}` : `  - ${o.label}`);
    }
  }
  const { asked, overflow, limit } = result.ask_round;
  console.log(`ask round: ${asked} asked, ${overflow} overflow (limit ${limit})`);
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(0);
  }
  if (sub !== "pending" && sub !== "record") {
    console.error(USAGE);
    console.error(`  unknown subcommand ${JSON.stringify(sub ?? null)} (expected: pending, record)`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        answers: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    usageError(err.message);
  }

  const { spec, answers, json } = parsed.values;
  if (!spec) usageError("--spec is required");
  if (sub === "record" && answers === undefined) usageError("--answers is required");

  const absRoot = resolve(projectRoot);
  try {
    if (sub === "pending") {
      const result = computePending(absRoot, spec);
      if (json) console.log(JSON.stringify(result));
      else printPending(result);
    } else {
      const result = recordDecisions(absRoot, spec, readAnswersInput(absRoot, answers));
      if (json) console.log(JSON.stringify(result));
      else console.log(`recorded ${result.recorded.length} decision(s): ${result.recorded.join(", ")}`);
    }
  } catch (err) {
    fatal(err);
  }
  process.exit(0);
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Reads and records operator answers to decision-classed review blockers.");
  console.log("");
  console.log("Subcommands:");
  console.log("  pending   List open decisions (question, options, header) and answered ones");
  console.log("  record    Write answers onto the spec's .blockers.md sidecar");
  console.log("");
  console.log("Required:");
  console.log("  --spec <path>     Live Spec under .context-index/specs/");
  console.log("  --answers <v>     (record) JSON array of { blocker_ids[], choice, note? },");
  console.log("                    inline or @<path> inside the project; max 64 KiB");
  console.log("");
  console.log("Optional:");
  console.log("  --json            pending: { spec, pending, answered, decided, ask_round, advisories }");
  console.log("                    record:  { recorded, advisories }");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  result printed (advisories never fail the verb)");
  console.log("  1  argument error, or a coded error printed as '<CODE>: <message>'");
}
