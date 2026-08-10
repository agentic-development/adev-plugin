// lib/parallel/eval/report.mjs
//
// Results renderer + rubric scoring for the equivalence eval
// (equivalence-eval.spec.md). Produces the markdown artifact
// (tests/evals/worktree-parallelization/results/eval-<date>.md) and a
// last-run.json object, and computes the rubric's Layer-1/Layer-3 (50/50)
// score. Pure — Node built-ins only; the rubric split (Layers 2/4 come from
// /adev:eval) is out of scope here.

const TOKEN_WARN_RATIO = 1.15;

/**
 * @param {object} run  captured run data (see spec Postconditions)
 * @returns {{ markdown: string, json: object }}
 */
export function renderReport(run) {
  const { serialA, serialB, parallel } = run.arms;
  const wallWarn = parallel.wallClockMs >= serialA.wallClockMs;
  const tokenWarn = parallel.tokens > serialA.tokens * TOKEN_WARN_RATIO;

  const json = {
    date: run.date,
    verdict: run.verdict,
    divergence_kind: run.divergence_kind ?? null,
    noise_floor: { d_ctrl: run.d_ctrl, d_par: run.d_par },
    overlap_ok: run.overlapOk,
    orphaned: run.orphaned,
    wall_clock: { serialA_ms: serialA.wallClockMs, serialB_ms: serialB.wallClockMs, parallel_ms: parallel.wallClockMs, warn: wallWarn },
    tokens: { serialA: serialA.tokens, parallel: parallel.tokens, ratio: parallel.tokens / serialA.tokens, warn: tokenWarn },
    impl_diff_advisory: run.implDiffSummary ?? null,
  };

  const md = [
    `# Equivalence Eval — ${run.date}`,
    "",
    `**Verdict:** ${run.verdict.toUpperCase()}${run.divergence_kind ? ` (divergence_kind: ${run.divergence_kind})` : ""}`,
    "",
    "## Noise-floor comparison (behavioral)",
    "",
    `- control divergence \`d_ctrl\` (serialB vs serialA): tests=${run.d_ctrl.tests.length}, surface=${run.d_ctrl.surface.length}`,
    `- parallel divergence \`d_par\` (parallel vs serialA): tests=${run.d_par.tests.length}, surface=${run.d_par.surface.length}`,
    "",
    "## Assertions",
    "",
    `- group-selection (overlap serialized): ${run.overlapOk ? "OK" : "FAIL — OVERLAP_PARALLELIZED"}`,
    `- orphaned state (all-success): ${(run.orphaned.worktrees.length || run.orphaned.branches.length || run.orphaned.lock) ? "FAIL — ORPHANED_STATE" : "clean"}`,
    "",
    "## Performance (WARN gates — advisory, not blocking)",
    "",
    `- wall-clock: serialA ${serialA.wallClockMs}ms → parallel ${parallel.wallClockMs}ms ${wallWarn ? "**WARN (not faster)**" : "OK"}`,
    `- tokens: ${(parallel.tokens / serialA.tokens).toFixed(2)}× serialA ${tokenWarn ? "**WARN (>1.15×)**" : "OK"}`,
    "",
    `## Impl diff (advisory — never a gate)`,
    "",
    run.implDiffSummary ?? "(none)",
    "",
  ].join("\n");

  return { markdown: md, json };
}

/**
 * Rubric score: Layer-1 (required_elements) + Layer-3 (quality_dimensions), 50/50.
 * @param {object} o
 * @param {number} o.elementsPassed
 * @param {number} o.elementsTotal
 * @param {number} o.qualityAvg5   weighted quality average on a 0-5 scale
 * @param {number} [o.requiredWeight=50]
 * @param {number} [o.qualityWeight=50]
 * @returns {{ layer1: number, layer3: number, total: number }}
 */
export function scoreRubric({ elementsPassed, elementsTotal, qualityAvg5, requiredWeight = 50, qualityWeight = 50 }) {
  const layer1 = elementsTotal > 0 ? (elementsPassed / elementsTotal) * requiredWeight : 0;
  const layer3 = (Math.max(0, Math.min(5, qualityAvg5)) / 5) * qualityWeight;
  return { layer1, layer3, total: layer1 + layer3 };
}
