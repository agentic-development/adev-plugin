// lib/cli/capability-map.mjs
//
// `adev capability-map set-status` — monotonic writer for a charter's
// Capability Map `Status` column. Wraps `lib/capability-map.mjs`'s
// `applyCapabilityStatus`, which refuses to write a status that is not
// strictly forward of the row's current value (see capability-status-column
// spec's Postcondition 2). Skills call this instead of editing the charter
// table directly so a re-review, a re-plan, or any other re-entry through an
// earlier lifecycle step cannot regress a row that already advanced past it.
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — this is a charter-metadata write used
//     inside several lifecycle steps (review-specs Step 7, specify, plan,
//     implement, validate), not a step entry/exit of its own.
//
// CLI surface:
//   adev capability-map set-status --charter <path> --capability <name> --status <status>
//
// Exit codes:
//   0  success — JSON on stdout, whether the write landed or was skipped as
//      non-monotonic (a skip is a correct outcome, not a failure)
//   1  argument error, containment violation, missing file, or unexpected exception

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveContained } from "../path-safety.mjs";
import { CAPABILITY_STATUSES, applyCapabilityStatus } from "../capability-map.mjs";

const USAGE = "usage: adev capability-map set-status --charter <path> --capability <name> --status <status>";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "set-status") {
    return runSetStatus({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected set-status)`);
  process.exit(1);
}

function runSetStatus({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        charter: { type: "string" },
        capability: { type: "string" },
        status: { type: "string" },
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

  for (const flag of ["charter", "capability", "status"]) {
    if (!v[flag]) {
      console.error(USAGE);
      console.error(`  missing --${flag}`);
      process.exit(1);
    }
  }

  if (!CAPABILITY_STATUSES.includes(v.status)) {
    console.error(
      `--status must be one of: ${CAPABILITY_STATUSES.join(", ")} (got ${JSON.stringify(v.status)})`,
    );
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const absCharter = resolveContained(absRoot, v.charter);
  if (!absCharter) {
    console.error(`charter path escapes project root: ${v.charter}`);
    process.exit(1);
  }
  if (!existsSync(absCharter)) {
    console.error(`charter not found: ${v.charter}`);
    process.exit(1);
  }

  const before = readFileSync(absCharter, "utf8");

  let result;
  try {
    result = applyCapabilityStatus(before, v.capability, v.status);
  } catch (err) {
    console.error(`capability-map set-status failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  if (result.updated) {
    writeFileSync(absCharter, result.content);
  }

  console.log(JSON.stringify({
    updated: result.updated,
    previousStatus: result.previousStatus ?? null,
    newStatus: result.updated ? result.newStatus : v.status,
    reason: result.reason ?? null,
  }));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev capability-map set-status --charter <path> --capability <name> --status <status>");
  console.log("");
  console.log("Monotonic writer for a charter's Capability Map Status column. Refuses to");
  console.log("write a status that is not strictly forward of the row's current value —");
  console.log("a re-review or other re-entry through an earlier lifecycle step reports");
  console.log("`updated: false, reason: \"NOT_MONOTONIC\"` instead of regressing the row.");
  console.log("");
  console.log(`Legal --status values (lifecycle order): ${CAPABILITY_STATUSES.join(" -> ")}`);
  console.log("");
  console.log("Stdout: JSON { updated, previousStatus, newStatus, reason }.");
  console.log("  reason is one of null, \"CAPABILITY_NOT_FOUND\", \"PARSE_ERROR\", \"NOT_MONOTONIC\".");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success — JSON on stdout, whether the write landed or was skipped");
  console.log("  1  argument error, containment violation, missing file, or unexpected exception");
}
