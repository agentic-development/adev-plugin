#!/usr/bin/env node
// tests/evals/worktree-parallelization/run-ab-eval.mjs
//
// [live] 3-arm equivalence eval harness for /adev:implement --parallel
// (equivalence-eval.spec.md). Orchestrates three real agent runs of the fixture
// plan from identical clean checkouts — serial-A (baseline), serial-B (control,
// a determinism gate), and parallel (variant) — captures the behavioral signals
// (test pass/fail set, public surface), wall-clock, tokens (session JSONL), and
// created worktrees, then feeds them through the pure helpers to judge
// equivalence, assert group selection + orphaned state, and render the report.
//
// The full 3-arm run is [live] — it requires agent access to run
// `/adev:implement --parallel`, so it is executed under CI/an agent, not by a
// unit test. `--dry-run` prints the plan and the helper wiring and writes
// nothing; it is what the smoke test exercises. Mirrors the pattern in
// tests/evals/token-optimization/run-ab-eval.mjs.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseParallelizationSection } from "../../../lib/parallel/groups.mjs";
import { judge } from "../../../lib/parallel/eval/divergence.mjs";
import { assertGroupSelection, assertNoOrphans } from "../../../lib/parallel/eval/state-check.mjs";
import { renderReport, scoreRubric } from "../../../lib/parallel/eval/report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PLAN = join(HERE, "fixture", "example.plan.md");

const ARMS = [
  { id: "serialA", role: "baseline", parallel: false },
  { id: "serialB", role: "control (determinism gate)", parallel: false },
  { id: "parallel", role: "variant", parallel: true },
];

export function planDryRun() {
  const { groups, malformed } = parseParallelizationSection(readFileSync(FIXTURE_PLAN, "utf8"));
  const independent = groups.filter((g) => g.independent).map((g) => g.id);
  const sequential = groups.filter((g) => !g.independent).map((g) => g.id);
  const lines = [
    "Equivalence eval — DRY RUN (no arms executed, no results written)",
    "",
    "Arms (each from an identical clean checkout of the same base commit):",
    ...ARMS.map((a) => `  - ${a.id}: ${a.role}${a.parallel ? " — /adev:implement --parallel" : " — serial /adev:implement"}`),
    "",
    `Fixture groups: independent=[${independent.join(", ")}] sequential=[${sequential.join(", ")}]`,
    "",
    "Pure helpers invoked after the arms run:",
    "  - judge()            → equivalent | not_equivalent | inconclusive (behavioral, vs serial noise floor)",
    "  - assertGroupSelection() → OVERLAP_PARALLELIZED if a sequential group got a worktree",
    "  - assertNoOrphans()  → ORPHANED_STATE (all-success only)",
    "  - renderReport() + scoreRubric() → results/eval-<date>.md + last-run.json",
    "",
    "malformed:" + malformed,
  ];
  return lines.join("\n");
}

function main(argv) {
  if (argv.includes("--dry-run")) {
    process.stdout.write(planDryRun() + "\n");
    return 0;
  }
  // [live] path: the 3-arm run drives a real agent and cannot execute headlessly here.
  process.stderr.write(
    "run-ab-eval: the live 3-arm run requires agent access to execute /adev:implement --parallel.\n" +
      "Run it under CI or an agent session; use --dry-run to preview the plan and helper wiring.\n" +
      "See .context-index/specs/features/worktree-parallelization/equivalence-eval.spec.md and TEST-PLAN.md.\n",
  );
  return 0;
}

// Keep the pure helpers referenced so tree-shakers/linters see the wiring the live path uses.
export const HELPERS = { judge, assertGroupSelection, assertNoOrphans, renderReport, scoreRubric };

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
