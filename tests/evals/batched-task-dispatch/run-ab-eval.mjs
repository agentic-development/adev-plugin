#!/usr/bin/env node
// tests/evals/batched-task-dispatch/run-ab-eval.mjs
//
// [live] 2-arm equivalence eval harness for /adev:implement batched dispatch
// (batched-task-dispatch.spec.md Output Contract G — "Equivalence is the
// load-bearing gate": a batched run MUST be behaviorally equivalent to its
// `--no-batch` twin on commit count, per-task commit contents, `plan_task`
// events, and review outcomes). This is a release-blocking acceptance
// criterion for the spec, not an advisory check.
//
// Two arms only: `no-batch` (baseline — today's already-shipped per-task
// serial dispatch) and `batched` (variant — the batch subagent). Unlike the
// 3-arm worktree-parallelization eval (tests/evals/worktree-parallelization/
// run-ab-eval.mjs), this harness does NOT need a third determinism-gate
// control arm: that third arm exists there because two independent agent
// runs of the *same serial* plan can already disagree with each other, and
// the eval needs to tell "the fixture is just noisy" apart from "parallel
// really diverged from serial". Here, the no-batch arm IS that already-
// shipped serial path — its determinism is not a new question this spec
// raises, so a single no-batch run is a sufficient baseline.
//
// judge()/renderReport() adapter (reuse, not reimplementation):
// `lib/parallel/eval/divergence.mjs`'s `judge({ serialA, serialB, parallel })`
// and `lib/parallel/eval/report.mjs`'s `renderReport(run)` are both hardcoded
// to three named arms — serialA (baseline), serialB (a determinism-gate
// control compared against serialA), and parallel (the variant compared
// against serialA). To reuse them verbatim for a 2-arm comparison rather than
// re-implementing divergence/report logic this codebase already has, the
// live orchestration below passes the SAME no-batch-arm capture as BOTH
// `serialA` and `serialB`, and the batched-arm capture as `parallel`. Because
// serialA and serialB are then identical by construction, `d_ctrl` (their
// divergence, i.e. judge()'s determinism gate) is trivially empty — it can
// never trip the `inconclusive` branch — which correctly degenerates the
// 3-arm determinism-gate logic into a pure 2-arm equivalence check: does
// `batched` (as `parallel`) diverge from `no-batch` (as `serialA`)? That is
// exactly this task's requirement. A future reader seeing `serialA`/
// `serialB`/`parallel` field names in this 2-arm file should read them as
// this adapter's plumbing, not as evidence of a hidden third real arm.
//
// The full 2-arm run is [live] — it requires agent access to run
// `/adev:implement` and `/adev:implement --no-batch` against the fixture
// plan, so it cannot execute headlessly under `node --test`. `--dry-run`
// prints the arm plan and the reused-helper wiring and writes nothing; that
// is what the smoke test exercises. Mirrors the pattern in
// tests/evals/worktree-parallelization/run-ab-eval.mjs.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseParallelizationSection } from "../../../lib/parallel/groups.mjs";
import { judge } from "../../../lib/parallel/eval/divergence.mjs";
import { renderReport, scoreRubric } from "../../../lib/parallel/eval/report.mjs";
import {
  verifyHandoffBlocks,
  verifyNoReadAhead,
  verifyPerTaskReviewRounds,
} from "../../../lib/implement/batch-verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PLAN = join(HERE, "fixture", "example.plan.md");

const ARMS = [
  { id: "no-batch", role: "baseline", batch: false },
  { id: "batched", role: "variant", batch: true },
];

/**
 * Pure, filesystem-read-only preview of what the live run would do: which
 * arms it dispatches and which fixture tasks form the eligible batch. Used
 * both by `--dry-run` and directly by the smoke test (no subprocess needed).
 *
 * @returns {string}
 */
export function planDryRun() {
  const { groups } = parseParallelizationSection(readFileSync(FIXTURE_PLAN, "utf8"));
  const batch = groups.filter((g) => !g.independent).flatMap((g) => g.members);
  const lines = [
    "arms:",
    ...ARMS.map((a) => `  ${a.id} (${a.role})`),
    `batch=[${batch.join(", ")}]`,
    "helpers: judge() + renderReport()/scoreRubric() from lib/parallel/eval/*",
    "postconditions: verifyHandoffBlocks() + verifyNoReadAhead() + verifyPerTaskReviewRounds() from lib/implement/batch-verify.mjs",
  ];
  return lines.join("\n");
}

// [live] orchestration (not executed here — requires agent access):
//
// 1. For each arm in ARMS, check out a clean copy of the same base commit and
//    run `/adev:implement --plan <FIXTURE_PLAN>` — with `--no-batch` for the
//    `no-batch` arm, without it for the `batched` arm (manifest
//    `implement.batch_mode` defaults to "on", so the batched arm needs no
//    extra flag). Capture per arm: the test pass/fail set, the public
//    surface set, wall-clock, tokens, commit count, and `plan_task` events —
//    the same signal shapes `judge()`/`renderReport()` already expect
//    (`{ tests, surface, wallClockMs, tokens }`), so no new capture format is
//    invented here.
//
// 2. For the `batched` arm specifically, ALSO run the Task 2 artifact-level
//    postconditions against its real output. This is what closes the gap
//    between "the checker functions are correct" (already proven against
//    synthetic fixtures by tests/lib/implement/batch-verify.test.mjs) and "a
//    real batched run actually satisfies Output Contract D/AC4-AC6":
//
//      const handoff = verifyHandoffBlocks({
//        packetsDir: batchedArm.packetsDir,
//        taskSlugs: batchedArm.batchTaskSlugs,
//      });
//      const readAhead = verifyNoReadAhead({
//        orderedTaskIds: batchedArm.batchTaskIds,
//        packetReadTimes: batchedArm.packetReadTimes,
//        commitTimes: batchedArm.commitTimes,
//      });
//      const reviewRounds = verifyPerTaskReviewRounds({
//        reviewRounds: batchedArm.reviewRounds, // read from currentState(...).reviewRounds,
//        plan: batchedArm.planPath,              // no new capture logic beyond Task 2's own
//        taskIds: batchedArm.batchTaskIds,
//      });
//
//    A batched run that diverges behaviorally per judge() but ALSO fails a
//    postcondition must report both — one failure must never mask the other.
//
// 3. Run the judge()/renderReport() adapter documented in the header comment:
//
//      const verdict = judge({ serialA: noBatchArm, serialB: noBatchArm, parallel: batchedArm });
//      const { markdown, json } = renderReport({
//        date: new Date().toISOString().slice(0, 10),
//        arms: { serialA: noBatchArm, serialB: noBatchArm, parallel: batchedArm },
//        verdict: verdict.verdict,
//        divergence_kind: verdict.divergence_kind,
//        d_ctrl: verdict.d_ctrl,   // trivially empty — see the adapter note above
//        d_par: verdict.d_par,     // the real no-batch-vs-batched divergence
//        overlapOk: true,          // batching has no worktree-selection axis to violate
//        orphaned: { worktrees: [], branches: [], lock: false }, // batching creates no worktree
//        implDiffSummary: null,
//      });
//
//    Fold handoff.ok / readAhead.ok / reviewRounds.ok into the rubric
//    alongside verdict.verdict, then write results/eval-<date>.md and
//    last-run.json (mirroring the worktree-parallelization eval's own
//    results/ layout).
//
// The exact fields captured on `noBatchArm` / `batchedArm` (packetsDir,
// batchTaskSlugs, batchTaskIds, packetReadTimes, commitTimes, reviewRounds)
// depend on how the live orchestration captures them at execution time —
// left to implementation time, since this is agent-dispatch code, not
// something a fixture/eval script should fully script ahead of running it.

function main(argv) {
  if (argv.includes("--dry-run")) {
    console.log("DRY RUN\n" + planDryRun());
    return 0;
  }
  // [live] path: the 2-arm run drives real /adev:implement invocations and
  // cannot execute headlessly here.
  process.stderr.write(
    "run-ab-eval: the live 2-arm run requires agent access to execute " +
      "/adev:implement and /adev:implement --no-batch against the fixture plan.\n" +
      "Run it under CI or an agent session; use --dry-run to preview the plan and helper wiring.\n" +
      "See .context-index/specs/features/implementation/batched-task-dispatch.spec.md (Output Contract G).\n",
  );
  return 0;
}

// Keep the reused pure helpers referenced so tree-shakers/linters see the
// wiring the live path uses (mirrors the worktree-parallelization eval).
export const HELPERS = {
  judge,
  renderReport,
  scoreRubric,
  verifyHandoffBlocks,
  verifyNoReadAhead,
  verifyPerTaskReviewRounds,
};

// Note: this sets process.exitCode rather than calling the exit function
// directly so a non-zero result still lets pending I/O (e.g. the console.log
// above) flush before the process ends naturally.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
