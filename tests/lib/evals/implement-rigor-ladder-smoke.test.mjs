import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HARNESS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/run-ab-eval.mjs');
const RESULTS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/results');

function dryRun() {
  return JSON.parse(execFileSync('node', [HARNESS, '--dry-run'], { encoding: 'utf8' }));
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

test('live quick and lite arms exit with ARM_NOT_YET_AVAILABLE', () => {
  for (const arm of ['quick', 'lite']) {
    const r = spawnSync('node', [HARNESS, '--arm', arm, '--runs', '1'], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /ARM_NOT_YET_AVAILABLE/);
  }
});
