// lib/cli/state.mjs
//
// `adev state` — CLI surface for lifecycle-state queries. Replaces the
// inline-Node blocks formerly embedded in:
//
//   skills/status/SKILL.md  "Mode: --all (default) — findSpecsByStatus loop"
//                           (lib/meta-tools.mjs::findSpecsByStatus)
//
// Also exposes the existing currentState / filterEvents / listLifecycleStates
// helpers from lib/lifecycle-state.mjs as CLI verbs so future extraction PRs
// (hygiene, recover, build) can call them through the canonical CLI surface
// instead of re-introducing inline Node — per spec Behavior 9 (CLI-verb naming
// is canonical and shared).
//
// Multi-mode verb. A single `adev state <subcommand>` dispatches to:
//
//   list                              — list lifecycle states (all specs)
//   list --status <s> [--module <m>]  — filter spec files by frontmatter status
//   current --spec <path>             — projected state for one spec
//   events  --spec <path> [--event <type>] — filtered event log
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: PR 7 (long-tail extraction — context/state primitives bundle)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — state queries are observational
//     helpers, not lifecycle-step entry/exit. The cli-driver pattern test
//     does NOT assert requireGate-first on this module.
//
// CLI surface:
//   adev state list [--status <s>] [--module <m>]
//   adev state current --spec <path>
//   adev state events  --spec <path> [--event <type>]
//   adev state --help
//
// Exit codes (per hook protocol):
//   0  success — JSON on stdout
//   1  argument error, containment violation, missing file, parse error

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { resolveContained } from "../path-safety.mjs";

import {
  currentState,
  filterEvents,
  listLifecycleStates,
} from "../lifecycle-state.mjs";
import { findSpecsByStatus } from "../meta-tools.mjs";

const USAGE = "usage: adev state <list|current|events> [flags]";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub === "list") {
    return await runList({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "current") {
    return await runCurrent({ projectRoot, argv: argv.slice(1) });
  }
  if (sub === "events") {
    return await runEvents({ projectRoot, argv: argv.slice(1) });
  }

  console.error(USAGE);
  console.error(`  unknown subcommand: ${sub} (expected list, current, or events)`);
  process.exit(1);
}

async function runList({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        status: { type: "string" },
        module: { type: "string" },
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

  const absRoot = resolve(projectRoot);
  // `list` runs in two modes:
  //
  // 1. With --status: spec-frontmatter scan via findSpecsByStatus(module,
  //    status). This matches the legacy skills/status/SKILL.md inline block.
  //    --module is optional ("*" or omitted = all modules).
  // 2. Without --status: lifecycle-state aggregate via listLifecycleStates
  //    (per-spec JSONL summaries). This is the agent-reliable-state-artifacts
  //    direction.
  if (v.status) {
    const module = v.module === undefined ? "*" : v.module;
    // Run from absRoot so findSpecsByStatus finds the right .context-index/.
    // findSpecsByStatus uses process.cwd() internally; mirror the existing
    // inline block's behaviour by chdir'ing for the call.
    const prevCwd = process.cwd();
    let results;
    try {
      try {
        process.chdir(absRoot);
      } catch (err) {
        console.error(`cannot chdir to project root: ${err.message ?? err}`);
        process.exit(1);
      }
      try {
        results = await findSpecsByStatus(module, v.status);
      } finally {
        try {
          process.chdir(prevCwd);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error(`state list failed: ${err && err.message ? err.message : err}`);
      process.exit(1);
    }
    console.log(
      JSON.stringify({
        status: v.status,
        module,
        count: results.length,
        specs: results,
      }),
    );
    process.exit(0);
  }

  // No --status: lifecycle-state aggregate.
  let records;
  try {
    records = listLifecycleStates(absRoot);
  } catch (err) {
    if (err && err.code === "INVALID_PROJECT_ROOT") {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`state list failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ count: records.length, records }));
  process.exit(0);
}

async function runCurrent({ projectRoot, argv }) {
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

  const v = parsed.values;
  if (v.help) {
    help();
    process.exit(0);
  }

  if (!v.spec) {
    console.error(USAGE);
    console.error("  current requires --spec");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  // Note: lifecycle-state expects spec paths *relative to projectRoot* (it
  // builds the storage path from `slugFromSpec(specPath)`). We accept either
  // absolute or relative; if absolute, strip the projectRoot prefix.
  let specArg = v.spec;
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) {
    console.error(`spec path escapes project root: ${v.spec}`);
    process.exit(1);
  }
  if (isAbsolute(v.spec)) {
    specArg = absSpec.startsWith(absRoot + sep)
      ? absSpec.slice(absRoot.length + 1)
      : v.spec;
  }

  let state;
  try {
    state = currentState(absRoot, specArg);
  } catch (err) {
    if (err && (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_SPEC_PATH")) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`state current failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  console.log(JSON.stringify(state));
  process.exit(0);
}

async function runEvents({ projectRoot, argv }) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        spec: { type: "string" },
        event: { type: "string" },
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
    console.error("  events requires --spec");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);
  let specArg = v.spec;
  const absSpec = resolveContained(absRoot, v.spec);
  if (!absSpec) {
    console.error(`spec path escapes project root: ${v.spec}`);
    process.exit(1);
  }
  if (isAbsolute(v.spec)) {
    specArg = absSpec.startsWith(absRoot + sep)
      ? absSpec.slice(absRoot.length + 1)
      : v.spec;
  }

  // Predicate: match-all when --event is absent, otherwise match e.event ===
  // <type>. The filterEvents API takes a predicate function; we cannot pass
  // arbitrary code from the CLI so we expose the most common predicate
  // (event-type equality). Richer predicates remain an in-process API.
  const predicate = v.event ? (e) => e && e.event === v.event : () => true;

  let events;
  try {
    events = filterEvents(absRoot, specArg, predicate);
  } catch (err) {
    if (err && (err.code === "INVALID_PROJECT_ROOT" || err.code === "INVALID_SPEC_PATH")) {
      console.error(`${err.code}: ${err.message}`);
      process.exit(1);
    }
    console.error(`state events failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  console.log(JSON.stringify({ count: events.length, events }));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev state <subcommand> [flags]");
  console.log("");
  console.log("Query lifecycle and spec state. Replaces the inline-Node blocks");
  console.log("formerly embedded in skills/status (findSpecsByStatus) and exposes");
  console.log("currentState / filterEvents / listLifecycleStates as canonical");
  console.log("CLI verbs for future extraction PRs.");
  console.log("");
  console.log("Subcommands:");
  console.log("");
  console.log("  list [--status <s>] [--module <m>]");
  console.log("    Without --status: aggregate lifecycle-state records via");
  console.log("      listLifecycleStates(projectRoot). Stdout: JSON");
  console.log("      { count, records: [{spec, slug, status, currentStep, updated}, ...] }.");
  console.log("    With --status: scan spec frontmatter via findSpecsByStatus.");
  console.log("      --module defaults to '*' (all modules + cross-cutting).");
  console.log("      Stdout: JSON { status, module, count, specs: [...] }.");
  console.log("");
  console.log("  current --spec <path>");
  console.log("    Read the per-spec lifecycle-state projection via");
  console.log("    currentState(projectRoot, specPath). Stdout: JSON projection");
  console.log("    { spec, status, currentStep, currentTask, steps, planTasks,");
  console.log("      interventions, startedAt, updatedAt }.");
  console.log("");
  console.log("  events --spec <path> [--event <type>]");
  console.log("    Read the event log via filterEvents. Without --event, returns");
  console.log("    every event; with --event <type>, filters by event-type");
  console.log("    equality. Stdout: JSON { count, events: [...] }.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument error, containment violation, INVALID_PROJECT_ROOT,");
  console.log("     INVALID_SPEC_PATH, or unexpected exception");
}
