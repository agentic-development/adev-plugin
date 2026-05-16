// lib/cli/gate.mjs
//
// adev gate require --skill <name> --spec <path>
//
// Query primitive: evaluates a lifecycle gate for a spec without performing
// any side-effecting work. Exit codes:
//   0  gate passes (prior step complete with PASS or PASS_WITH_NOTES verdict)
//   2  gate blocked (GateError, per hook protocol)
//   1  argument error or spec not found
//
// NOTE: gate.mjs does NOT export LIFECYCLE_STEP because it is not bound to
// a lifecycle step — it is a query over state, not a step that mutates state.
// Consequently, tests/cli-driver-pattern.test.mjs's AST-grep does not assert
// the "requireGate first" rule against gate.mjs. The rule fires for future
// lifecycle-bound helpers extracted in the inline-node-extraction-sweep.

import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

import { currentState, requireGate, resolveGateMode } from "../lifecycle-state.mjs";

// Map skill name → lifecycle step the skill ENTERS. `requireGate` will then
// check that the prior step in STEP_ORDER is completed with a passing verdict.
const SKILL_STEP_MAP = {
  brainstorm: "brainstorm",
  specify: "specify",
  "review-specs": "review",
  plan: "plan",
  implement: "implement",
  validate: "validate",
  retro: "retro",
};

const USAGE = "usage: adev gate require --skill <name> --spec <path>";

export async function run({ projectRoot, argv }) {
  const sub = argv[0];
  if (sub !== "require") {
    console.error(USAGE);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(1),
      options: {
        skill: { type: "string" },
        spec: { type: "string" },
      },
      allowPositionals: false,
    });
  } catch {
    console.error(USAGE);
    process.exit(1);
  }

  const { skill, spec } = parsed.values;
  if (!skill) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!spec) {
    console.error(USAGE);
    process.exit(1);
  }

  // Path containment (SEC-1 from spec review): resolve spec relative to
  // projectRoot and reject anything that escapes the project tree.
  const absRoot = resolve(projectRoot);
  const absSpec = isAbsolute(spec) ? spec : resolve(absRoot, spec);
  if (!absSpec.startsWith(absRoot + sep) && absSpec !== absRoot) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }
  if (!existsSync(absSpec)) {
    console.error(`spec not found: ${spec}`);
    process.exit(1);
  }

  const step = SKILL_STEP_MAP[skill];
  if (!step) {
    console.error(`unknown skill: ${skill} (no lifecycle step mapping)`);
    process.exit(1);
  }

  // First lifecycle-domain statement: requireGate. State load + mode
  // resolution are inlined into the call so that requireGate(...) is the
  // single expression doing the helper's domain work (per Postcondition 1
  // of driver-substrate.spec.md and the canonical sketch in
  // research/adev-vs-compiler-dispatch-patterns.md §7.2). The manifest is
  // re-loaded here (rather than relying on the dispatcher's `manifest`
  // argument) so this helper remains testable in isolation.
  const { loadManifest } = await import("../manifest.mjs");
  requireGate(
    currentState(absRoot, absSpec),
    step,
    { mode: resolveGateMode(loadManifest(absRoot)) },
  );
  // If we reach here, the gate passes.
  process.exit(0);
}

export function help() {
  console.log("Usage: adev gate require --skill <name> --spec <path>");
  console.log("");
  console.log("Evaluate a lifecycle gate without performing the skill's work.");
  console.log("");
  console.log("Exit codes:");
  console.log("  0  gate passes");
  console.log("  2  gate blocked (prior step incomplete or missing verdict)");
  console.log("  1  argument error or spec not found");
  console.log("");
  console.log("Skills supported:");
  for (const skill of Object.keys(SKILL_STEP_MAP)) {
    console.log(`  ${skill}`);
  }
}
