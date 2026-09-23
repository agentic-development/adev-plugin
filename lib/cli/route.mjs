// lib/cli/route.mjs
//
// `adev route <subverb>` — CLI surface for the plan-routing sidecar.
//
// Subverbs:
//   adev route emit-sidecar    --plan <plan-path>      reads entries[] JSON from stdin;
//                                                       writes <plan-stem>.routing.json
//   adev route render-sidecar  --plan <plan-path>      prints a markdown view of the
//                                                       sidecar to stdout (no file write)
//
// Exit codes:
//   0 success
//   1 argument error, JSON parse failure, INVALID_PLAN_PATH, INVALID_ROUTING_ENTRY,
//     ROUTING_SIDECAR_MISSING (render-sidecar), INVALID_SIDECAR_JSON, or unexpected exception
//   2 SIDECAR_WRITE_FAILED (atomic rename failure)
//
// All paths are exercised through lib/plan-routing-sidecar.mjs (the lib owns
// schema validation, atomic write, and markdown rendering). This module is the
// I/O shim.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import {
  writeRoutingSidecar,
  readRoutingSidecar,
  renderRoutingMarkdown,
  sidecarPathFor,
} from "../plan-routing-sidecar.mjs";

const USAGE =
  "usage: adev route <emit-sidecar|render-sidecar> --plan <plan-path>";

export async function run({ argv }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  switch (sub) {
    case "emit-sidecar":
      return cmdEmitSidecar(argv.slice(1));
    case "render-sidecar":
      return cmdRenderSidecar(argv.slice(1));
    default:
      console.error(`unknown subverb: ${sub}\n${USAGE}`);
      process.exit(1);
  }
}

function cmdEmitSidecar(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { plan: { type: "string" } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\nusage: adev route emit-sidecar --plan <plan-path>`);
    process.exit(1);
  }

  const planPath = parsed.values.plan;
  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }

  // Read entries[] payload from stdin.
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    console.error(`failed to read stdin: ${err.message}`);
    process.exit(1);
  }

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (err) {
    console.error(`failed to parse JSON from stdin: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(entries)) {
    console.error(
      `INVALID_ROUTING_ENTRY: stdin payload must be a JSON array of entries (got ${typeof entries})`,
    );
    process.exit(1);
  }

  try {
    writeRoutingSidecar(planPath, entries);
  } catch (err) {
    const code = err && err.code;
    if (code === "SIDECAR_WRITE_FAILED") {
      console.error(err.message);
      if (err.tmpPath) console.error(`tmp left at: ${err.tmpPath}`);
      process.exit(2);
    }
    if (code === "INVALID_PLAN_PATH" || code === "INVALID_ROUTING_ENTRY") {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      ok: true,
      sidecar: sidecarPathFor(planPath),
      entries: entries.length,
    }),
  );
  process.exit(0);
}

function cmdRenderSidecar(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: { plan: { type: "string" } },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}\nusage: adev route render-sidecar --plan <plan-path>`);
    process.exit(1);
  }

  const planPath = parsed.values.plan;
  if (!planPath) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }

  let entries;
  try {
    entries = readRoutingSidecar(planPath);
  } catch (err) {
    const code = err && err.code;
    if (code === "ROUTING_SIDECAR_MISSING" || code === "INVALID_SIDECAR_JSON" || code === "INVALID_PLAN_PATH") {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }

  process.stdout.write(renderRoutingMarkdown(entries));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev route <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  emit-sidecar   --plan <plan-path>   write <plan-stem>.routing.json from JSON entries on stdin");
  console.log("  render-sidecar --plan <plan-path>   print a markdown view of the sidecar to stdout");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument / JSON / schema error, ROUTING_SIDECAR_MISSING (render-sidecar)");
  console.log("  2  SIDECAR_WRITE_FAILED (atomic rename failure)");
}
