// lib/implement/review-depth.mjs
//
// Resolves the effective review depth for a single /adev:implement task. The
// ladder is applied in this order:
//
//   1. tier-full-absolute — `--tier full` always wins; no floor is consulted.
//   2. baseline           — `--tier quick`, else the spec's
//                           risk level in risk-policies.yaml
//                           (policies[<risk_level>].implement_mode), recorded
//                           as `policy-baseline`. A policy `lite` is a `quick`
//                           baseline. With no policy value the baseline is
//                           `quick`, recorded as `default-quick`.
//   3. lite grant         — operator-authorized `lite` for route-eligible
//                           tasks. Not granted by this module yet, so every
//                           task resolves `quick` or `full`.
//   4. floor              — escalating only; any holding leg forces `full`:
//                           risk-level (a high-risk spec on a task not routed
//                           auto-agent), routing (human-only), boundary and
//                           sensitive-path (declared paths on both passes,
//                           every touched path on the final pass),
//                           critical-finding (final pass).
//   5. tripwire           — final-pass upward escalation of a `lite` task.
//
// Routing scores and the shape of the task's file set are not grant
// conditions: a task with no floor leg resolves at its baseline.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isValidTier, InvalidTierError } from '../governance/rigor-mode.mjs';
import { codedError } from '../errors.mjs';
import { effectiveSensitivePaths } from '../test-strategies/sensitive-paths.mjs';
import { matchGlob } from '../test-strategies/manifest.mjs';
import { slugFromSpec } from '../lifecycle-state.mjs';

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
 * Records the worktree as it stands right now as a git tree object: the
 * current index (so staged state counts) plus every file `git add -A` would
 * pick up, i.e. tracked modifications and untracked files not excluded by
 * .gitignore. Built in a throwaway index, so the real index, the working
 * tree and HEAD are never touched; the only side effect is loose objects in
 * the object store, which `git gc` reclaims.
 *
 * Captured once at task dispatch and passed as the final pass's `baseSha`,
 * it lets computeTouchedFiles() see only what the task itself changed.
 * Files that were already untracked or dirty when the task started (session
 * logs, other specs' lifecycle logs, editor droppings) are part of the base
 * and drop out of the diff.
 *
 * @param {string} projectRoot
 * @returns {string} tree object id
 */
export function snapshotWorkingTree(projectRoot) {
  const git = (args, env) =>
    execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      env: env ? { ...process.env, ...env } : process.env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

  const realIndex = resolve(projectRoot, git(['rev-parse', '--git-path', 'index']));
  const dir = mkdtempSync(join(tmpdir(), 'adev-task-snapshot-'));
  const index = join(dir, 'index');
  try {
    // Seeding from the real index keeps its stat cache, so `add -A` re-hashes
    // only files that changed instead of every tracked file in the repo. The
    // copy must keep the real index's mtime: git treats an entry whose file
    // mtime is not older than the index file as "racily clean" and re-hashes
    // it, and a fresh copy's newer mtime would turn that check off, so a
    // same-size edit made within the same timestamp tick would look unchanged.
    if (existsSync(realIndex)) {
      copyFileSync(realIndex, index);
      const { atime, mtime } = statSync(realIndex);
      utimesSync(index, atime, mtime);
    } else {
      git(['read-tree', '--empty'], { GIT_INDEX_FILE: index });
    }
    git(['add', '-A'], { GIT_INDEX_FILE: index });
    return git(['write-tree'], { GIT_INDEX_FILE: index });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The files a task touched: `git diff-tree --no-renames --name-status -r`
 * from `baseSha`'s tree to a fresh snapshotWorkingTree(). Every path the
 * worktree gained, changed or lost since the base is reported with its own
 * status (`A`/`M`/`D`/`T`), untracked files included.
 *
 * `baseSha` may be a commit or a tree from snapshotWorkingTree(). With a
 * commit, the result equals the previous union of `git diff <commit>` and
 * `git ls-files --others --exclude-standard` (every untracked file as `A`),
 * because the snapshot holds tracked edits and untracked files alike. With a
 * dispatch-time snapshot, whatever predated the task is excluded.
 *
 * `--no-renames` is deliberate: a rename must surface as a paired D (old
 * path) + A (new path) rather than collapsing into a single R entry, so the
 * old path is still seen by the touched-path floor legs (moving a file out of
 * a sensitive directory is a change to that directory).
 *
 * This is the only place the touched-file computation lives; it never
 * accepts a caller-supplied file list.
 *
 * @param {string} projectRoot
 * @param {string} baseSha commit or tree-ish
 * @returns {{ path: string, status: string }[]}
 */
export function computeTouchedFiles(projectRoot, baseSha) {
  if (!baseSha) {
    throw codedError('MISSING_DIFF_RANGE', 'computeTouchedFiles requires a baseSha to diff against');
  }

  const current = snapshotWorkingTree(projectRoot);
  // `-z --name-status` emits STATUS\0PATH\0STATUS\0PATH\0... — consumed in pairs.
  const fields = execFileSync(
    'git',
    ['diff-tree', '-r', '--no-renames', '--name-status', '-z', `${baseSha}^{tree}`, current],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .split('\0')
    .filter((s) => s !== '');

  const records = [];
  for (let i = 0; i < fields.length; i += 2) {
    records.push({ status: fields[i], path: fields[i + 1] });
  }
  return records;
}


/**
 * Output Contract K: excludes exactly one record from the touched-path
 * floor legs — a status-`M` (not A, not D) touch to the CURRENT task's
 * own spec's lifecycle log at `.context-index/lifecycle-state/<slug>.jsonl`,
 * which the orchestrator itself appends to during every task. Nothing wider:
 * other specs' logs and other statuses on this spec's own log both remain in
 * scope. A missing/unparseable `spec.specPath` disables the exclusion
 * entirely (nothing to derive a slug from).
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
 * Floor pass. Applied after the baseline, escalating only: any holding leg
 * forces `depth: 'full'`.
 *
 *   - `risk-level`: the spec is high-risk and the task is not routed
 *     `auto-agent` (a missing routing entry is not `auto-agent`).
 *   - `routing`: the task is routed `human-only`.
 *   - `boundary` / `sensitive-path`: the declared paths on both passes; on the
 *     final pass also every touched path from computeTouchedFiles(), after
 *     the Output-Contract-K exclusion. The touched-path `boundary` check runs
 *     only when the caller injects `boundaryCheck`, so this module never reads
 *     boundaries.yaml itself.
 *   - `critical-finding`: final pass only.
 *
 * The final pass always needs `baseSha` (throws `MISSING_DIFF_RANGE`), since
 * the touched-path legs cannot be evaluated without a diff range.
 *
 * @param {object} input
 * @returns {{ depth: string, floor_applied: boolean, floor_legs: string[], warnings: object[] }}
 */
function resolveFloor({
  depth,
  spec,
  task,
  routingEntry,
  boundaryCrossing,
  boundaryCheck,
  targetPaths,
  sensitivePaths,
  pass,
  baseSha,
  projectRoot,
}) {
  let touchedPaths = [];
  if (pass === 'final') {
    if (!baseSha) {
      throw codedError('MISSING_DIFF_RANGE', 'the final pass requires a baseSha to compute touched files');
    }
    touchedPaths = excludeOwnLifecycleLogTouch(computeTouchedFiles(projectRoot, baseSha), spec).map((r) => r.path);
  }

  const effective = effectiveSensitivePaths(sensitivePaths ?? []);
  const anySensitive = (paths) => paths.some((p) => effective.some((pattern) => matchGlob(pattern, p)));
  const touchedCrossesBoundary =
    touchedPaths.length > 0 && typeof boundaryCheck === 'function' && boundaryCheck(touchedPaths) === true;
  const selectedAgent = routingEntry?.selected_agent;

  const legs = [];
  if (spec?.risk_level === 'high' && selectedAgent !== 'auto-agent') legs.push('risk-level');
  if (selectedAgent === 'human-only') legs.push('routing');
  if (boundaryCrossing || touchedCrossesBoundary) legs.push('boundary');
  if (anySensitive(targetPaths ?? []) || anySensitive(touchedPaths)) legs.push('sensitive-path');
  if (pass === 'final' && task?.had_critical_finding === true) legs.push('critical-finding');

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
 * The baseline depth before the floor. An explicit `--tier quick` is the run's
 * baseline and outranks the policy. `--tier lite` only authorizes the lite
 * grant, so it reads the policy exactly as no `--tier` does. A policy `lite`
 * is a `quick` baseline here, because only the lite grant resolves a task
 * `lite`.
 *
 * @param {string|null|undefined} tierFlag - already validated; never `full`
 * @param {object} [policies]
 * @param {string} riskLevel
 * @returns {{ depth: string, source: string }}
 */
function resolveBaseline(tierFlag, policies, riskLevel) {
  if (tierFlag === 'quick') return { depth: 'quick', source: 'policy-baseline' };

  const value = policies?.[riskLevel]?.implement_mode;
  if (value == null) return { depth: 'quick', source: 'default-quick' };
  // loadRigorPolicies validates on load; a caller passing an unvalidated map
  // must not have a typo read as a lighter review.
  if (!isValidTier(value)) throw new InvalidTierError(value, { level: riskLevel, field: 'implement_mode' });
  return { depth: value === 'lite' ? 'quick' : value, source: 'policy-baseline' };
}

/**
 * Resolves the review depth for a single /adev:implement task: tier-full
 * absolute check, then the baseline, then the floor pass. Not pure on the
 * final pass — it shells out to `git` via `computeTouchedFiles`.
 *
 * `MISSING_DIFF_RANGE` is thrown by the floor, so it applies only once the
 * floor is consulted: `--tier full` returns before the check and needs no
 * `baseSha` on the final pass.
 *
 * @param {object} input
 * @param {object} [input.spec] - Spec frontmatter (`risk_level` drives the policy lookup and the risk-level leg; `specPath` drives the own-lifecycle-log exclusion).
 * @param {object} [input.task] - The plan task (`had_critical_finding` feeds the critical-finding leg; `in_batch` and `additive_only` are ignored).
 * @param {object} [input.routingEntry] - This task's `.routing.json` entry (`selected_agent` feeds the risk-level and routing legs).
 * @param {string} [input.tierFlag] - Explicit `--tier full|quick|lite`, if given.
 * @param {object} [input.policies] - `risk-policies.yaml` `policies` map.
 * @param {boolean} [input.boundaryCrossing=false] - Whether the declared paths cross a `boundaries.yaml` rule.
 * @param {(paths: string[]) => boolean} [input.boundaryCheck] - Final pass: whether the touched paths cross a `boundaries.yaml` rule. When absent, the touched-path boundary check is skipped.
 * @param {string[]} [input.targetPaths] - Declared task paths for the sensitive-path leg; may be empty/absent.
 * @param {string[]} [input.sensitivePaths] - Configured sensitive-path extensions (unioned with the built-in set).
 * @param {string} [input.pass] - `'final'` adds the touched-path legs and the critical-finding leg.
 * @param {string} [input.baseSha] - Required on the final pass unless `--tier full`: the diff range for touched files.
 * @param {string} [input.projectRoot] - Working tree root for the final pass's git calls.
 * @returns {{ depth: string, source: string, floor_applied: boolean, floor_legs: string[], warnings: object[] }}
 */
export function resolveImplementReviewDepth({
  spec,
  task,
  routingEntry,
  tierFlag,
  policies,
  boundaryCrossing = false,
  boundaryCheck,
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
  const { depth, source } = resolveBaseline(tierFlag, policies, riskLevel);

  const floorResult = resolveFloor({
    depth,
    spec,
    task,
    routingEntry,
    boundaryCrossing,
    boundaryCheck,
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
    warnings: floorResult.warnings,
  };
}
