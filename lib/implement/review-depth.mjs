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
// Task 5 adds the FLOOR PASS (mirroring lib/test-strategies/depth.mjs's
// monotonic-upward floor), composed as the final internal step after the
// precedence chain above — exactly like resolveTestDepth()'s multi-call
// composition. Five legs: risk-level, boundary, sensitive-path,
// critical-finding, batched-task, plus the git-diff-based scope-mismatch
// leg (with its Output-Contract-K lifecycle-log exclusion).

import { execFileSync } from 'node:child_process';
import { isValidTier, InvalidTierError } from '../governance/rigor-mode.mjs';
import { codedError } from '../errors.mjs';
import { effectiveSensitivePaths } from '../test-strategies/sensitive-paths.mjs';
import { matchGlob } from '../test-strategies/manifest.mjs';
import { slugFromSpec } from '../lifecycle-state.mjs';

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
 * Computes the union of tracked changes (`git diff --no-renames
 * --name-status` against `baseSha`, working-tree relative) and untracked
 * files (`git ls-files --others --exclude-standard`, each treated as status
 * `A`). `--no-renames` is deliberate: a staged rename must surface as a
 * paired D (old path) + A (new path) rather than collapsing into a single
 * R entry, so an out-of-scope delete can still be caught by the
 * scope-mismatch leg below.
 *
 * Exported for reuse by a later CLI-verb task — this is the only place the
 * git-diff computation lives.
 *
 * @param {string} projectRoot
 * @param {string} baseSha
 * @returns {{ path: string, status: string }[]}
 */
export function computeTouchedFiles(projectRoot, baseSha) {
  if (!baseSha) {
    throw codedError('MISSING_DIFF_RANGE', 'computeTouchedFiles requires a baseSha to diff against');
  }

  const gitZ = (args) =>
    execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter((s) => s !== '');

  // `--name-status -z` emits each field as its own NUL-terminated token:
  // STATUS\0PATH\0STATUS\0PATH\0... (not tab-separated) — consumed in pairs.
  const trackedFields = gitZ(['diff', '--no-renames', '--name-status', '-z', baseSha]);
  const tracked = [];
  for (let i = 0; i < trackedFields.length; i += 2) {
    tracked.push({ status: trackedFields[i], path: trackedFields[i + 1] });
  }

  const untracked = gitZ(['ls-files', '--others', '--exclude-standard', '-z']).map((path) => ({
    status: 'A',
    path,
  }));

  return [...tracked, ...untracked];
}

/**
 * Output Contract K: excludes exactly one record from scope-mismatch
 * consideration — a status-`M` (not A, not D) touch to the CURRENT task's
 * own spec's lifecycle log at `.context-index/lifecycle-state/<slug>.jsonl`.
 * Nothing wider: other specs' logs and other statuses on this spec's own
 * log both remain in scope. A missing/unparseable `spec.specPath` disables
 * the exclusion entirely (nothing to derive a slug from).
 *
 * @param {{ path: string, status: string }[]} records
 * @param {object} spec
 * @returns {{ path: string, status: string }[]}
 */
function excludeOwnLifecycleLogTouch(records, spec) {
  if (!spec?.specPath) return records;

  let ownLogPath;
  try {
    ownLogPath = `.context-index/lifecycle-state/${slugFromSpec(spec.specPath)}.jsonl`;
  } catch {
    return records;
  }

  let excluded = false;
  return records.filter((r) => {
    if (!excluded && r.status === 'M' && r.path === ownLogPath) {
      excluded = true;
      return false;
    }
    return true;
  });
}

/**
 * The scope-mismatch leg: after the Output-Contract-K exclusion, holds when
 * any remaining touched record is either undeclared (not in
 * `task.declared_files`) or was declared but touched with a status other
 * than `A` (modified/deleted/type-changed rather than freshly added).
 *
 * @param {{ path: string, status: string }[]} records
 * @param {object} task
 * @returns {boolean}
 */
function scopeMismatchLeg(records, task) {
  const declared = new Set(task?.declared_files ?? []);
  return records.some((r) => !declared.has(r.path) || r.status !== 'A');
}

/**
 * Floor pass. Applied last, after the precedence chain above —
 * escalating only, forcing `depth: 'full'`. Five legs: `risk-level`,
 * `boundary`, `sensitive-path`, `critical-finding` (final pass only),
 * `batched-task`, plus `scope-mismatch` (final pass only, git-diff-based,
 * gated on `task.declared_files` being present — see below).
 *
 * The `scope-mismatch` leg is only evaluated when `task.declared_files` is
 * an array (mirroring the sensitive-path leg's "skip when target-path set
 * is empty" pattern) — a task with no declared-file set has nothing to
 * compare touched files against. Once evaluated, it requires `baseSha`,
 * throwing `MISSING_DIFF_RANGE` when absent.
 *
 * @param {object} input
 * @returns {{ depth: string, floor_applied: boolean, floor_legs: string[], warnings: object[] }}
 */
function resolveFloor({
  depth,
  spec,
  task,
  boundaryCrossing,
  targetPaths,
  sensitivePaths,
  pass,
  baseSha,
  projectRoot,
}) {
  const paths = targetPaths ?? [];
  const legs = [];

  if (spec?.risk_level === 'high') legs.push('risk-level');
  if (boundaryCrossing) legs.push('boundary');
  if (paths.length > 0) {
    const effective = effectiveSensitivePaths(sensitivePaths ?? []);
    if (paths.some((p) => effective.some((pattern) => matchGlob(pattern, p)))) {
      legs.push('sensitive-path');
    }
  }
  if (pass === 'final' && task?.had_critical_finding === true) legs.push('critical-finding');
  if (task?.in_batch === true) legs.push('batched-task');

  if (pass === 'final' && Array.isArray(task?.declared_files)) {
    if (!baseSha) {
      throw codedError('MISSING_DIFF_RANGE', 'the scope-mismatch floor leg requires a baseSha on the final pass');
    }
    const touched = computeTouchedFiles(projectRoot, baseSha);
    const considered = excludeOwnLifecycleLogTouch(touched, spec);
    if (scopeMismatchLeg(considered, task)) legs.push('scope-mismatch');
  }

  const floor_applied = legs.length > 0;
  const finalDepth = floor_applied ? 'full' : depth;

  // A REVIEW_DEPTH_FLOOR_APPLIED warning is emitted whenever any evaluated
  // floor leg held, whether or not the floor changed the resolved value
  // (floor visibility must be unconditional).
  const warnings = floor_applied
    ? [{ code: 'REVIEW_DEPTH_FLOOR_APPLIED', message: `review depth floored to full (${legs.join(', ')})`, legs }]
    : [];

  return { depth: finalDepth, floor_applied, floor_legs: legs, warnings };
}

/**
 * Resolves the review depth for a single /adev:implement task: tier-full
 * absolute check, then policy baseline, then (when authorized) the
 * quick-grant predicate, then the floor pass. Not pure when the
 * scope-mismatch leg is evaluated (final pass with `task.declared_files`
 * present) — it shells out to `git` via `computeTouchedFiles`.
 *
 * @param {object} input
 * @param {object} [input.spec] - Spec frontmatter (`risk_level` drives the policy lookup and floor; `specPath` drives the scope-mismatch exclusion).
 * @param {object} [input.task] - The plan task (`additive_only`, `in_batch`, `had_critical_finding`, `declared_files` feed the predicate/floor).
 * @param {object} [input.routingEntry] - This task's `.routing.json` entry (`selected_agent`, `scores`).
 * @param {string} [input.tierFlag] - Explicit `--tier full|quick`, if given.
 * @param {object} [input.policies] - `risk-policies.yaml` `policies` map.
 * @param {boolean} [input.boundaryCrossing=false] - Whether a `boundaries.yaml` rule is crossed.
 * @param {string[]} [input.targetPaths] - Parsed task paths for the sensitive-path floor leg; may be empty/absent.
 * @param {string[]} [input.sensitivePaths] - Configured sensitive-path extensions (unioned with the built-in set).
 * @param {string} [input.pass] - `'final'` gates the critical-finding and scope-mismatch legs.
 * @param {string} [input.baseSha] - Required by the scope-mismatch leg on the final pass.
 * @param {string} [input.projectRoot] - Working tree root for the scope-mismatch leg's git calls.
 * @returns {{ depth: string, source: string, floor_applied: boolean, floor_legs: string[], warnings: object[] }}
 */
export function resolveImplementReviewDepth({
  spec,
  task,
  routingEntry,
  tierFlag,
  policies,
  boundaryCrossing = false,
  targetPaths,
  sensitivePaths,
  pass,
  baseSha,
  projectRoot,
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

  const floorResult = resolveFloor({
    depth,
    spec,
    task,
    boundaryCrossing,
    targetPaths,
    sensitivePaths,
    pass,
    baseSha,
    projectRoot,
  });

  return {
    depth: floorResult.depth,
    source,
    floor_applied: floorResult.floor_applied,
    floor_legs: floorResult.floor_legs,
    warnings: [...warnings, ...floorResult.warnings],
  };
}
