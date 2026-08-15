// lib/cli/governance.mjs
//
// adev governance materialize --registry <name> [--dry-run] [--json]
//
// Writes a governance registry's EFFECTIVE set into the project's own file and
// stamps the write-once `materialized_at` marker, so that reading the file tells
// you what runs. All computation lives in lib/governance/materialize.mjs; this
// module owns argument parsing, output formatting and exit codes.
//
// Exit codes (the `adev gate doctor` convention, minus the findings code —
// materialize either succeeds or refuses, it never reports findings):
//   0  success, including a no-op second run and every --dry-run
//   1  argument error, an unknown or EXEMPT registry, a containment refusal,
//      or a refusal to write (MATERIALIZE_WOULD_DROP, MATERIALIZE_SOURCE_UNMAPPED,
//      GOVERNANCE_PARSE_REFUSED, GOVERNANCE_SCALAR_UNSAFE)
//
// Contract (driver-substrate): exports `run({ projectRoot, argv, manifest })`
// and `help()`. Does NOT export LIFECYCLE_STEP — materializing a registry is
// maintenance, not a lifecycle step entry or exit.

import { parseArgs } from "node:util";
import { resolve } from "node:path";

const USAGE =
  "usage: adev governance materialize --registry <review|diagnostics|gates> [--dry-run] [--json]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub !== "materialize") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub === undefined ? "<none>" : sub}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        registry: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const { registry } = parsed.values;
  if (!registry) {
    console.error(USAGE);
    console.error("  missing --registry");
    process.exit(1);
  }

  const { materialize } = await import("../governance/materialize.mjs");

  let result;
  try {
    result = await materialize(resolve(projectRoot), registry, {
      dryRun: parsed.values["dry-run"],
    });
  } catch (err) {
    console.error(`${err?.code ?? "ERROR"}: ${err?.message ?? String(err)}`);
    process.exit(1);
  }

  const envelope = {
    registry: result.registry,
    path: result.path,
    root_key: result.root_key,
    materialized_at: result.materialized_at,
    marker_written: result.marker_written,
    already_explicit: result.already_explicit,
    newly_written: result.newly_written,
    changed: result.changed,
    dry_run: result.dry_run,
  };

  if (parsed.values.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printReport(result, envelope);
  }
  process.exit(0);
}

function printReport(result, envelope) {
  console.log(`# governance materialize — ${result.registry}`);
  console.log("");
  console.log(`${result.path} (root key: ${result.root_key})`);
  console.log(`already explicit: ${format(envelope.already_explicit)}`);
  console.log(`newly written:    ${format(envelope.newly_written)}`);
  console.log(`materialized_at:  ${envelope.materialized_at}`);
  console.log("");
  const diff = unifiedDiff(result.before_text ?? "", result.after_text, result.path);
  console.log(diff === "" ? "(no change)" : diff);
  console.log("");
  console.log(result.dry_run ? "DRY RUN — nothing was written." : "written.");
}

function format(ids) {
  return ids.length === 0 ? "(none)" : ids.join(", ");
}

/**
 * A minimal diff for a write that only ever INSERTS lines: trim the common
 * prefix and suffix and print what is left. Correct for the general case too —
 * it degrades to "the whole middle changed" rather than to a wrong answer —
 * and needs no dependency (Constitution Principle 1).
 */
function unifiedDiff(before, after, label) {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }

  const out = [`--- a/${label}`, `+++ b/${label}`, `@@ -${head + 1} +${head + 1} @@`];
  for (const line of a.slice(head, a.length - tail)) out.push(`-${line}`);
  for (const line of b.slice(head, b.length - tail)) out.push(`+${line}`);
  return out.join("\n");
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Write a governance registry's EFFECTIVE set into the project's own file");
  console.log("and stamp the write-once `materialized_at` marker, so that reading the");
  console.log("file tells you what actually runs.");
  console.log("");
  console.log("  --registry <name>   review | diagnostics | gates");
  console.log("  --dry-run           print the diff and write nothing");
  console.log("  --json              emit the machine-readable envelope");
  console.log("");
  console.log("  validate.yaml and boundaries.yaml are EXEMPT (DDR-1): both are already");
  console.log("  explicit single-source registries, so naming either is refused.");
  console.log("");
  console.log("  Write-once: a second run preserves the original stamp verbatim, so an");
  console.log("  unchanged effective set produces byte-identical output. Entries already");
  console.log("  on disk keep their positions and their bytes; contributed entries are");
  console.log("  appended. Comments and sibling keys survive.");
  console.log("");
  console.log("  Exit codes:");
  console.log("    0  success (including a no-op second run and every --dry-run)");
  console.log("    1  argument error, unknown or exempt registry, containment refusal,");
  console.log("       or a refusal to write (MATERIALIZE_WOULD_DROP)");
}
