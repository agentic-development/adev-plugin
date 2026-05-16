// lib/cli/context.mjs
//
// `adev context` — CLI surface for spec/plan context loading. Replaces the
// inline-Node blocks formerly embedded in:
//
//   skills/implement/SKILL.md  "Step 1: Load Context"        (loadSpecContext + getPlanProgress)
//   skills/plan/SKILL.md       "Optimization: loadSpecContext" (loadSpecContext)
//   skills/validate/SKILL.md   "Plan progress optimization"   (getPlanProgress)
//
// Subcommand surface per spec Behavior 9 — CLI-verb naming canonical and
// shared. A single `adev context load` dispatches; `--spec` and/or `--plan`
// select what to emit:
//
//   --spec <p>             → emit { context }            (loadSpecContext only)
//   --plan <p>             → emit { progress }           (getPlanProgress only)
//   --spec <p> --plan <q>  → emit { context, progress }  (both)
//
// At least one of --spec or --plan is required.
//
// Source spec: .context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md
// Task: PR 7 (long-tail extraction — context/state primitives bundle)
//
// Contract (driver-substrate):
//   - Exports `run({ projectRoot, argv, manifest })` and `help()`.
//   - Does NOT export LIFECYCLE_STEP — context loading is an observational
//     helper inside lifecycle steps, not a step entry/exit. The cli-driver
//     pattern test (tests/cli-driver-pattern.test.mjs) does NOT assert
//     requireGate-first on this module.
//
// CLI surface:
//   adev context load --spec <path>
//   adev context load --plan <path>
//   adev context load --spec <path> --plan <path>
//   adev context --help
//
// Exit codes (per hook protocol):
//   0  success — JSON written to stdout
//   1  argument error, containment violation, missing file, parse error

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { loadSpecContext, getPlanProgress } from "../meta-tools.mjs";

const USAGE = "usage: adev context load (--spec <path> | --plan <path>) [...]";

/**
 * Containment check (mirrors lib/cli/gate.mjs SEC-1, source-manifest.mjs,
 * and domain.mjs): resolve `relPath` against `absRoot` and reject anything
 * that escapes the tree. Returns the absolute path on success, or null on
 * out-of-bounds.
 */
function resolveContained(absRoot, relPath) {
  const abs = isAbsolute(relPath) ? relPath : resolve(absRoot, relPath);
  if (abs !== absRoot && !abs.startsWith(absRoot + sep)) return null;
  return abs;
}

export async function run({ projectRoot, argv }) {
  const sub = argv[0];

  if (sub === undefined || sub === "--help" || sub === "-h") {
    help();
    process.exit(sub === undefined ? 1 : 0);
  }

  if (sub !== "load") {
    console.error(USAGE);
    console.error(`  unknown subcommand: ${sub} (expected load)`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        spec: { type: "string" },
        plan: { type: "string" },
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

  if (!v.spec && !v.plan) {
    console.error(USAGE);
    console.error("  load requires at least one of --spec or --plan");
    process.exit(1);
  }

  const absRoot = resolve(projectRoot);

  // Containment-check both paths before any work. Spec and plan must live
  // under the project root (or be absolute paths inside it).
  let absSpec = null;
  if (v.spec) {
    absSpec = resolveContained(absRoot, v.spec);
    if (!absSpec) {
      console.error(`spec path escapes project root: ${v.spec}`);
      process.exit(1);
    }
    if (!existsSync(absSpec)) {
      console.error(`spec not found: ${v.spec}`);
      process.exit(1);
    }
  }

  let absPlan = null;
  if (v.plan) {
    absPlan = resolveContained(absRoot, v.plan);
    if (!absPlan) {
      console.error(`plan path escapes project root: ${v.plan}`);
      process.exit(1);
    }
    if (!existsSync(absPlan)) {
      console.error(`plan not found: ${v.plan}`);
      process.exit(1);
    }
  }

  // Load both in parallel when both requested (mirrors the original inline
  // block's Promise.all in skills/implement/SKILL.md).
  const tasks = [];
  if (absSpec) tasks.push(loadSpecContext(absSpec));
  if (absPlan) tasks.push(getPlanProgress(absPlan));

  let results;
  try {
    results = await Promise.all(tasks);
  } catch (err) {
    console.error(`context load failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  }

  const out = {};
  let idx = 0;
  if (absSpec) {
    out.context = results[idx++];
  }
  if (absPlan) {
    out.progress = results[idx++];
  }

  console.log(JSON.stringify(out));
  process.exit(0);
}

export function help() {
  console.log("Usage: adev context load (--spec <path> | --plan <path>) [...]");
  console.log("");
  console.log("Load spec context (charter capability map + constitution principles)");
  console.log("and/or plan progress (task counts + completion) in a single call.");
  console.log("Replaces the inline-Node blocks formerly embedded in skills/implement,");
  console.log("skills/plan, and skills/validate.");
  console.log("");
  console.log("Flags:");
  console.log("  --spec <path>   Spec file to load context for (delegates to loadSpecContext)");
  console.log("  --plan <path>   Plan file to compute progress for (delegates to getPlanProgress)");
  console.log("");
  console.log("At least one of --spec or --plan is required.");
  console.log("");
  console.log("Stdout (single line JSON):");
  console.log("  { context }              when only --spec is supplied");
  console.log("  { progress }             when only --plan is supplied");
  console.log("  { context, progress }    when both are supplied");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  success");
  console.log("  1  argument error, containment violation, missing file, or load error");
}
