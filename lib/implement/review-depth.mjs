// lib/implement/review-depth.mjs
//
// Resolves the effective review depth ("full" | "quick") for a single
// /adev:implement task via a strictly ordered precedence chain:
//
//   1. tier-full-absolute — `--tier full` always wins, no floor consulted.
//   2. policy-baseline    — spec risk_level -> risk-policies.yaml
//                           policies[<risk_level>].implement_mode
//                           ("full" is the safe default for a missing or
//                           malformed value).
//   3. quick-grant predicate — evaluated whenever the baseline (or an
//      explicit `--tier quick`) authorizes it: all four routing-score
//      dimensions must be >= 0.6, the routed agent must be "auto-agent",
//      the task must be additive-only, and no governance boundary may be
//      crossed. Any single failing row denies the grant and the depth
//      resolves to "full".
//
// This is Task 4 of a two-task build. The FLOOR PASS (mirroring
// lib/test-strategies/depth.mjs's monotonic-upward floor) is added by a
// LATER task extending this same file — the bare return below is the seam
// for that extension; a subsequent `resolveFloor()` composes as the final
// internal step, exactly like resolveTestDepth()'s three-call composition.

import { isValidTier, InvalidTierError } from '../governance/rigor-mode.mjs';

const QUICK_GRANT_THRESHOLD = 0.6;
const SCORE_DIMENSIONS = ['spec_completeness', 'pattern_coverage', 'blast_radius', 'novelty'];

/**
 * Validates the four routing-score dimensions are finite numbers in [0, 1].
 * No coercion — an out-of-range or non-numeric value is reported, never
 * clamped or defaulted.
 *
 * @param {object} scores
 * @returns {{ allValid: boolean, warnings: object[] }}
 */
function validateScores(scores) {
  const warnings = [];
  let allValid = true;
  for (const dim of SCORE_DIMENSIONS) {
    const v = scores?.[dim];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      warnings.push({ code: 'ROUTING_SCORE_OUT_OF_RANGE', dimension: dim, value: v });
      allValid = false;
    }
  }
  return { allValid, warnings };
}

/**
 * The quick-grant predicate: four independent rows, all of which must pass.
 * A single failing row denies the grant — no partial credit.
 *
 * @param {object} input
 * @returns {{ granted: boolean, warnings: object[] }}
 */
function quickGrantPredicate({ routingEntry, boundaryCrossing, additiveOnly }) {
  if (routingEntry?.selected_agent !== 'auto-agent') return { granted: false, warnings: [] };

  const { allValid, warnings } = validateScores(routingEntry?.scores);
  if (!allValid) return { granted: false, warnings };

  const allAboveThreshold = SCORE_DIMENSIONS.every(
    (dim) => routingEntry.scores[dim] >= QUICK_GRANT_THRESHOLD,
  );
  if (!allAboveThreshold) return { granted: false, warnings };

  if (boundaryCrossing) return { granted: false, warnings };
  if (!additiveOnly) return { granted: false, warnings };

  return { granted: true, warnings };
}

/**
 * Resolves the review depth for a single /adev:implement task: tier-full
 * absolute check, then policy baseline, then (when authorized) the
 * quick-grant predicate. Pure — no I/O.
 *
 * @param {object} input
 * @param {object} [input.spec] - Spec frontmatter (`risk_level` drives the policy lookup).
 * @param {object} [input.task] - The plan task (`additive_only` feeds the predicate).
 * @param {object} [input.routingEntry] - This task's `.routing.json` entry (`selected_agent`, `scores`).
 * @param {string} [input.tierFlag] - Explicit `--tier full|quick`, if given.
 * @param {object} [input.policies] - `risk-policies.yaml` `policies` map.
 * @param {boolean} [input.boundaryCrossing=false] - Whether a `boundaries.yaml` rule is crossed.
 * @param {string[]} [input.touchedFiles] - Reserved for the later floor-pass extension.
 * @returns {{ depth: string, source: string, floor_applied: boolean, floor_legs: string[], warnings: object[] }}
 */
export function resolveImplementReviewDepth({
  spec,
  task,
  routingEntry,
  tierFlag,
  policies,
  boundaryCrossing = false,
  touchedFiles,
} = {}) {
  if (tierFlag != null && tierFlag !== '') {
    if (!isValidTier(tierFlag)) throw new InvalidTierError(tierFlag);
    if (tierFlag === 'full') {
      return { depth: 'full', source: 'tier-full-absolute', floor_applied: false, floor_legs: [], warnings: [] };
    }
  }

  const riskLevel = spec?.risk_level ?? 'medium';
  const baselineRaw = policies?.[riskLevel]?.implement_mode;
  const baseline = isValidTier(baselineRaw) ? baselineRaw : 'full';

  let depth = baseline;
  let source = 'policy-baseline';
  let warnings = [];

  if (baseline === 'quick' || tierFlag === 'quick') {
    const predicateResult = quickGrantPredicate({
      routingEntry,
      boundaryCrossing,
      additiveOnly: task?.additive_only === true,
    });
    warnings = predicateResult.warnings ?? [];
    if (predicateResult.granted) {
      depth = 'quick';
      source = 'predicate-grant';
    } else {
      depth = 'full';
      source = warnings.some((w) => w.code === 'ROUTING_SCORE_OUT_OF_RANGE')
        ? 'score-out-of-range'
        : 'predicate-denied';
    }
  }

  return { depth, source, floor_applied: false, floor_legs: [], warnings };
  // Floor pass seam: a LATER task extends this exact function/file, adding a
  // `resolveFloor()` private function and calling it as the final internal
  // step here (composing with the result above) — mirroring
  // lib/test-strategies/depth.mjs's resolveTestDepth() three-call chain.
  // Do not treat this return as final/closed.
}
