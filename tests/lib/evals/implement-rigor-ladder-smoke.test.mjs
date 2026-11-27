import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir } from '../../helpers.mjs';

const HARNESS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/run-ab-eval.mjs');
const RESULTS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/results');

function dryRun(extra = []) {
  return JSON.parse(execFileSync('node', [HARNESS, '--dry-run', ...extra], { encoding: 'utf8' }));
}

test('EV-1 --dry-run prints all three arms and writes nothing', () => {
  const before = existsSync(RESULTS) ? readdirSync(RESULTS).sort() : [];
  const plan = dryRun();
  assert.deepEqual(plan.arms.map((a) => a.id), ['full', 'quick', 'lite']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'lite').implementArgs, ['--lite']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'full').implementArgs, ['--tier full']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'quick').implementArgs, []);
  assert.equal(plan.writes.length, 0);
  const after = existsSync(RESULTS) ? readdirSync(RESULTS).sort() : [];
  assert.deepEqual(after, before);
});

test('fixture mixes eligible and ineligible tasks and names its traps', () => {
  const plan = dryRun();
  assert.ok(plan.fixture.tasks >= 6 && plan.fixture.tasks <= 8);
  assert.ok(plan.fixture.liteEligible >= 1 && plan.fixture.liteIneligible >= 1);
  assert.equal(plan.fixture.liteEligible + plan.fixture.liteIneligible, plan.fixture.tasks);
  assert.ok(plan.fixture.sensitivePathTask);
  assert.ok(plan.fixture.tripwireTargetTask);
  assert.equal(plan.fixture.seededDefects.length, 4);
});

test('fixture counts are derived from the 7-task plan and sidecar', () => {
  const plan = dryRun();
  assert.equal(plan.fixture.tasks, 7);
  assert.equal(plan.fixture.liteEligible, 3);
  assert.equal(plan.fixture.liteIneligible, 4);
});

test('metrics declare wall clock, dispatches, token usage keys, gates and per-defect catch point', () => {
  const plan = dryRun();
  assert.equal(plan.metrics.wall_clock_ms.source, 'lifecycle-event-timestamps');
  assert.ok('agent_dispatches' in plan.metrics);
  assert.deepEqual(plan.metrics.tokens.fields, [
    'input_tokens',
    'output_tokens',
    'cache_creation_input_tokens',
    'cache_read_input_tokens',
  ]);
  assert.ok('quality_gates' in plan.metrics);
  assert.deepEqual(plan.metrics.defects.caught_at, ['implement', 'validate', 'escaped']);
});

test('reuses the parallel-eval judge and report helpers', () => {
  const plan = dryRun();
  assert.deepEqual(plan.reuses.sort(), ['lib/parallel/eval/divergence.mjs#judge', 'lib/parallel/eval/report.mjs#renderReport']);
});

test('the baseline is pinned: dry-run names the --rebaseline override and accepts the flag', () => {
  const plan = dryRun(['--rebaseline']);
  assert.equal(plan.baseline.overwrite, 'refused (BASELINE_EXISTS) unless --rebaseline');
});

test('quick and lite arms are live-enabled and thresholds are declared', () => {
  const plan = dryRun();
  assert.equal(plan.arms.every((a) => a.live), true);
  assert.deepEqual(plan.thresholds, { lite_wall_clock_vs_full: 0.5, quick_wall_clock_vs_full: 0.8, lite_escaped_defects_max_over_full: 1 });
});

test('nonconvergent fixture dry-run lists both modes and the Stage 1 case (WR-8)', () => {
  const plan = dryRun(['--fixture', 'nonconvergent']);
  assert.deepEqual(plan.modes, ['build', 'direct']);
  assert.ok(plan.fixture.cases.includes('stage1-spec-compliance-nonconvergent'));
  assert.deepEqual(plan.expect, { plan_task: 'blocked', execution_state: 'blocked', later_task_started: false, step_failed: false, waits_for_input: false, build_status: 'BLOCKED' });
});

test('nonconvergent fixture roles are derived from its plan, sidecar and sensitive paths', () => {
  const plan = dryRun(['--fixture', 'nonconvergent']);
  assert.deepEqual(plan.fixture.cases, ['escalated-lite-code-quality-nonconvergent', 'stage1-spec-compliance-nonconvergent']);
  assert.deepEqual(
    plan.fixture.taskRoles.map((t) => [t.id, t.role, t.liteArm.provisional, t.liteArm.expectedFinal]),
    [
      ['1', 'tripwire-target', 'lite', 'quick'],
      ['2', 'sensitive-path', 'full', 'full'],
      ['3', 'lite-eligible', 'lite', 'lite'],
    ],
  );
  assert.deepEqual(
    plan.fixture.caseDetails.map((c) => [c.id, c.halted_task, c.loop, c.later_tasks, c.preseed_done]),
    [
      ['escalated-lite-code-quality-nonconvergent', '1', 'code-quality', ['2', '3'], []],
      ['stage1-spec-compliance-nonconvergent', '2', 'spec-compliance', ['3'], ['1']],
    ],
  );
  assert.equal(plan.fixture.maxReviewCycles, 1);
  assert.deepEqual(plan.writes, []);
});

test('nonconvergent prompts run implement directly or as a build step, with --lite in both', () => {
  const plan = dryRun(['--fixture', 'nonconvergent']);
  assert.equal(plan.prompts.direct, '/adev:implement .context-index/specs/features/inventory/inventory.plan.md --lite');
  assert.equal(
    plan.prompts.build,
    '/adev:build --spec .context-index/specs/features/inventory/inventory.spec.md --resume --from implement --auto --lite',
  );
  assert.deepEqual(dryRun(['--fixture', 'nonconvergent', '--mode', 'direct']).modes, ['direct']);
});

test('a live nonconvergent run without --mode is a usage error', () => {
  const r = spawnSync('node', [HARNESS, '--fixture', 'nonconvergent'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /USAGE: --fixture nonconvergent needs --mode build\|direct/);
});

test('an unknown fixture or mode is a usage error', () => {
  let r = spawnSync('node', [HARNESS, '--dry-run', '--fixture', 'bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /USAGE: --fixture must be one of ev1\|nonconvergent/);
  r = spawnSync('node', [HARNESS, '--dry-run', '--fixture', 'nonconvergent', '--mode', 'batch'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /USAGE: --mode must be one of build\|direct/);
});

test('a live quick or lite arm fails loudly with BASELINE_MISSING before any model call', () => {
  const dir = createTempDir();
  try {
    for (const arm of ['quick', 'lite']) {
      const r = spawnSync('node', [HARNESS, '--arm', arm, '--runs', '1', '--results-dir', dir], { encoding: 'utf8' });
      assert.equal(r.status, 1);
      assert.match(r.stderr, /BASELINE_MISSING: no baseline-main-<date>\.json in /);
    }
    assert.deepEqual(readdirSync(dir), []);
  } finally {
    cleanupTempDir(dir);
  }
});

function writeJson(dir, name, body) {
  writeFileSync(join(dir, name), `${JSON.stringify(body)}\n`);
}

function armRun(arm, ref, finishedAt) {
  return {
    arm,
    ref,
    finished_at: finishedAt,
    valid: true,
    implement: { verdict: 'PASS' },
    metrics: { wall_clock_ms: 100, quality_gates: { pass: true }, defects: [] },
    review_depths: {},
  };
}

test('--evaluate defaults to the ref of the latest quick/lite runs and reports what it matched', () => {
  const dir = createTempDir();
  const older = 'a'.repeat(40);
  const newer = 'b'.repeat(40);
  try {
    writeJson(dir, 'baseline-main-2026-11-26.json', {
      ref: 'main', sha: 'c'.repeat(40), runs: 3, valid_runs: 3, invalid_runs: 0,
      median_wall_clock_ms: 1000, median_escaped_defects: 0, quality_gates_pass_all: true,
    });
    writeJson(dir, 'quick-aaaaaaaaaaaa-1.json', armRun('quick', older, '2026-11-26T10:00:00.000Z'));
    writeJson(dir, 'quick-bbbbbbbbbbbb-2.json', armRun('quick', newer, '2026-11-26T12:00:00.000Z'));
    writeJson(dir, 'lite-bbbbbbbbbbbb-3.json', armRun('lite', newer, '2026-11-26T11:00:00.000Z'));

    const r = spawnSync('node', [HARNESS, '--evaluate', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ref, newer);
    assert.equal(out.ref_source, 'latest-results');
    assert.deepEqual(out.matched_runs, { quick: 1, lite: 1 });

    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const flagged = JSON.parse(spawnSync('node', [HARNESS, '--evaluate', '--ref', 'HEAD', '--results-dir', dir], { encoding: 'utf8' }).stdout);
    assert.equal(flagged.ref, head);
    assert.equal(flagged.ref_source, 'flag');
    assert.deepEqual(flagged.matched_runs, { quick: 0, lite: 0 });
  } finally {
    cleanupTempDir(dir);
  }
});

test('--evaluate with a baseline but no quick or lite runs exits 1 with NO_ARM_RESULTS', () => {
  const dir = createTempDir();
  try {
    writeJson(dir, 'baseline-main-2026-11-26.json', { ref: 'main', sha: 'c'.repeat(40), runs: 0, valid_runs: 0 });
    const r = spawnSync('node', [HARNESS, '--evaluate', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NO_ARM_RESULTS/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('--evaluate fails loudly with BASELINE_MISSING when no baseline is recorded', () => {
  const dir = createTempDir();
  try {
    const r = spawnSync('node', [HARNESS, '--evaluate', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /BASELINE_MISSING/);
  } finally {
    cleanupTempDir(dir);
  }
});
