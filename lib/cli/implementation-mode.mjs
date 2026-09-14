// lib/cli/implementation-mode.mjs
//
// `adev implementation-mode resolve` — CLI surface for implementation mode
// resolution (lib/implementation-modes/resolve.mjs).
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — resolution is observational, not a
//     lifecycle step entry/exit (mirrors lib/cli/domain.mjs on this point;
//     tests/cli-driver-pattern.test.mjs does not assert requireGate-first
//     on this module).
//
// Exit codes (per hook protocol):
//   0  success — JSON written to stdout
//   1  invalid --mode value, invalid project root, or argument-parsing error
//      (UNKNOWN_IMPLEMENTATION_MODE, INVALID_PROJECT_ROOT, unrecognized flags)
//   2  manifest.yaml failed to parse (MANIFEST_PARSE_ERROR)

import { parseArgs } from "node:util";
import { resolveImplementationModeFromProjectRoot } from "../implementation-modes/resolve.mjs";

const USAGE = "usage: adev implementation-mode resolve [--mode tdd|test-required|agent-default]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "resolve") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub}`);
    process.exit(1);
  }

  const subArgv = argv.slice(1);
  let values;
  try {
    ({ values } = parseArgs({
      args: subArgv,
      options: { mode: { type: "string" } },
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err.message ?? err}`);
    process.exit(1);
  }

  let result;
  try {
    result = resolveImplementationModeFromProjectRoot(projectRoot, values.mode);
  } catch (err) {
    const message = err.code && !err.message.includes(err.code) ? `${err.code}: ${err.message}` : err.message;
    if (err.code === "MANIFEST_PARSE_ERROR") {
      console.error(message);
      process.exit(2);
    }
    console.error(message);
    process.exit(1);
  }

  console.log(JSON.stringify(result));
  process.exit(0);
}

export function help() {
  console.log(USAGE);
}
