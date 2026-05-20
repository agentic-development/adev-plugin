// lib/cli/route.mjs
//
// `adev route emit-sidecar` — CLI surface wrapping
// lib/plan-routing-sidecar.mjs::writeRoutingSidecar so the /adev:route SKILL.md
// names a verb instead of inlining a Node heredoc (cli-driver-surface charter).
//
// Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
// Plan-task: t2
//
// Subverbs:
//   adev route emit-sidecar --plan <plan-path>      reads entries[] JSON from stdin
//
// Exit codes:
//   0 success
//   1 argument error, JSON parse failure, INVALID_PLAN_PATH, INVALID_ROUTING_ENTRY,
//     or unexpected exception
//   2 SIDECAR_WRITE_FAILED (atomic rename failure)
//
// All paths are exercised through lib/plan-routing-sidecar.mjs (the lib owns
// schema validation and atomic write). This module is the I/O shim.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

import { writeRoutingSidecar } from "../plan-routing-sidecar.mjs";

const USAGE =
  "usage: adev route <emit-sidecar> --plan <plan-path>";

export async function run({ argv }) {
  const sub = argv[0];
  if (!sub) {
    console.error(USAGE);
    process.exit(1);
  }
  switch (sub) {
    case "emit-sidecar":
      return cmdEmitSidecar(argv.slice(1));
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

  const sidecar = planPath.replace(/\.plan\.md$/, ".routing.md");
  console.log(
    JSON.stringify({
      ok: true,
      sidecar,
      entries: entries.length,
    }),
  );
  process.exit(0);
}

export function help() {
  console.log("Usage: adev route <subverb> [flags]");
  console.log("");
  console.log("Subverbs:");
  console.log("  emit-sidecar --plan <plan-path>   write <plan-stem>.routing.md from JSON entries on stdin");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument / JSON / schema error");
  console.log("  2  SIDECAR_WRITE_FAILED (atomic rename failure)");
}
