// lib/cli/blockers.mjs
//
// adev blockers write --spec <path> --findings <json|@path> [--revision <n>] [--json]
//
// CLI wrapper around `lib/blockers-writer.mjs::writeBlockers` — the canonical
// producer of `<spec-stem>.blockers.md`. Existed only as a bare lib function
// named in skill prose (skills/review-specs/SKILL.md Step 6b-bis), with no
// CLI entry point for an agent to actually invoke it through per the
// project's inline-Node ban (CLAUDE.md). This verb is that entry point.
//
// Contract (driver-substrate): exports `run({ projectRoot, argv })` and
// `help()`. Does NOT export LIFECYCLE_STEP — writing the sidecar is a
// byproduct of the review step, not a lifecycle step entry/exit itself.
//
// Exit codes:
//   0  sidecar written (or cleared, for an empty findings array)
//   1  argument error, invalid findings JSON, or a path escaping the project
//   2  BLOCKER_BODY_EMPTY, INVALID_BLOCKER_ID, or another writer-level refusal

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { writeBlockers } from "../blockers-writer.mjs";
import { resolveContained } from "../path-safety.mjs";

const USAGE =
  "usage: adev blockers write --spec <path> --findings <json|@path> [--revision <n>] [--json]";

/**
 * Parse `--findings` into a JS array. Accepts either a JSON array literal or
 * `@<path>` naming a JSON file inside the project root. Mirrors
 * `parseGateOutcomes` in lib/cli/report.mjs — same shape, same error style.
 */
function parseFindings(raw, absRoot) {
  let text = raw;
  let origin = "--findings";

  if (raw.startsWith("@")) {
    const relPath = raw.slice(1);
    if (relPath.length === 0) {
      return { ok: false, error: "--findings @<path> requires a path after '@'" };
    }
    const abs = resolveContained(absRoot, relPath);
    if (!abs) {
      return { ok: false, error: `--findings path escapes project root: ${relPath}` };
    }
    try {
      text = readFileSync(abs, "utf8");
    } catch (err) {
      return { ok: false, error: `--findings could not read ${relPath}: ${err && err.message ? err.message : String(err)}` };
    }
    origin = `--findings @${relPath}`;
  }

  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) {
      return { ok: false, error: `${origin} must be a JSON array` };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: `${origin} is not valid JSON: ${err && err.message ? err.message : String(err)}` };
  }
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub === "--help" || sub === "-h" || sub === "help") {
    help();
    process.exit(0);
  }
  if (sub !== "write") {
    console.error(USAGE);
    console.error(`  unknown subcommand ${JSON.stringify(sub)} (expected: write)`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        findings: { type: "string" },
        revision: { type: "string" },
        json: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(USAGE);
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  const v = parsed.values;
  if (!v.spec) {
    console.error(USAGE);
    console.error("  --spec is required");
    process.exit(1);
  }
  if (!v.findings) {
    console.error(USAGE);
    console.error("  --findings is required");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  const parsedFindings = parseFindings(v.findings, absRoot);
  if (!parsedFindings.ok) {
    console.error(parsedFindings.error);
    process.exit(1);
  }

  let revision;
  if (v.revision !== undefined) {
    revision = Number(v.revision);
    if (!Number.isInteger(revision)) {
      console.error(`--revision must be an integer (got ${JSON.stringify(v.revision)})`);
      process.exit(1);
    }
  }

  let result;
  try {
    result = writeBlockers(absRoot, v.spec, parsedFindings.value, revision !== undefined ? { revision } : {});
  } catch (err) {
    console.error(`${err.code ?? "BLOCKERS_WRITE_FAILED"}: ${err.message ?? String(err)}`);
    process.exit(2);
  }

  if (v.json) {
    console.log(JSON.stringify(result));
  } else if (result.entries === 0) {
    console.log(`${result.sidecarPath}: cleared (no findings)`);
  } else {
    console.log(`${result.sidecarPath}: ${result.entries} entr${result.entries === 1 ? "y" : "ies"} written`);
    if (result.collisions.length > 0) {
      console.log(`  BLOCKER_ID_COLLISION advisory: ${result.collisions.length} colliding blocker_id(s)`);
    }
  }
  process.exit(0);
}

export function help() {
  console.log(USAGE);
  console.log("");
  console.log("Writes <spec-stem>.blockers.md — the canonical, machine-consumable sidecar");
  console.log("for a BLOCK verdict — from a reviewer findings array.");
  console.log("");
  console.log("Required:");
  console.log("  --spec <path>       Live Spec the findings apply to");
  console.log("  --findings <v>      JSON array of findings, or @<path> to a JSON file.");
  console.log("                      Each entry: { blocker_id, section_anchor, reviewer, prose }");
  console.log("");
  console.log("Optional:");
  console.log("  --revision <n>      Spec revision, recorded in the sidecar header");
  console.log("  --json              Emit the writer's return value as JSON");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  sidecar written or cleared");
  console.log("  1  argument error / invalid --findings JSON / path escapes project root");
  console.log("  2  writer refused the write (BLOCKER_BODY_EMPTY, INVALID_BLOCKER_ID, ...)");
}
