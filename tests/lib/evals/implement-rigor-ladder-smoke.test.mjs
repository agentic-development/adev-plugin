import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir } from '../../helpers.mjs';

const HARNESS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/run-ab-eval.mjs');
const RESULTS = join(import.meta.dirname, '../../evals/implement-rigor-ladder/results');
const NONCONVERGENT_DIR = join(import.meta.dirname, '../../evals/implement-rigor-ladder/fixture-nonconvergent');

function dryRun(extra = []) {
  return JSON.parse(execFileSync('node', [HARNESS, '--dry-run', ...extra], { encoding: 'utf8' }));
}

test('EV-1 --dry-run prints the three adev arms and the plain arm, and writes nothing', () => {
  const before = existsSync(RESULTS) ? readdirSync(RESULTS).sort() : [];
  const plan = dryRun();
  assert.deepEqual(plan.arms.map((a) => a.id), ['full', 'quick', 'lite', 'plain']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'lite').implementArgs, ['--lite']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'full').implementArgs, ['--tier full']);
  assert.deepEqual(plan.arms.find((a) => a.id === 'quick').implementArgs, []);
  const plain = plan.arms.find((a) => a.id === 'plain');
  assert.equal(plain.implementArgs, null);
  assert.equal(plain.adev, false);
  assert.doesNotMatch(plain.prompt, /adev/i);
  assert.equal(plan.writes.length, 0);
  const after = existsSync(RESULTS) ? readdirSync(RESULTS).sort() : [];
  assert.deepEqual(after, before);
});

test('EV-1 --dry-run --arm narrows the plan to that arm, and an unknown arm is a usage error', () => {
  for (const arm of ['full', 'quick', 'lite', 'plain']) {
    assert.deepEqual(dryRun(['--arm', arm]).arms.map((a) => a.id), [arm]);
  }
  const r = spawnSync('node', [HARNESS, '--dry-run', '--arm', 'bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /USAGE: --arm must be one of full\|quick\|lite\|plain/);
});

test('EV-1 --dry-run declares the edge-probe battery, the patch output and the isolation settings', () => {
  const plan = dryRun();
  assert.equal(plan.edgeProbes.total, 54);
  assert.deepEqual(plan.edgeProbes.strict, ['P6', 'T8', 'T9', 'L6']);
  assert.deepEqual(Object.keys(plan.edgeProbes.by_behavior), ['BEH-1', 'BEH-2', 'BEH-3', 'BEH-4', 'BEH-5', 'BEH-6', 'BEH-7']);
  assert.equal(plan.patchOutput, 'results/<arm>-<ref-short>-<iso>.patch');
  assert.equal(plan.isolation.settings.enabledPlugins['adev@agentic-development'], false);
  assert.ok(Object.values(plan.isolation.settings.enabledPlugins).every((v) => v === false));
  assert.equal(plan.metrics.process_wall_clock_ms.arms, 'every arm, the like-for-like column');
});

test('--check-isolation prints each arm\'s spawn without a model call; --probe needs --check-isolation', () => {
  const out = JSON.parse(execFileSync('node', [HARNESS, '--check-isolation'], { encoding: 'utf8' }));
  assert.deepEqual(out.arms.map((a) => a.arm), ['full', 'quick', 'lite', 'plain']);
  for (const a of out.arms) {
    assert.equal(a.run_argv.includes('--plugin-dir'), a.arm !== 'plain', a.arm);
    assert.ok(a.run_argv.includes('--settings'), a.arm);
    assert.ok(a.probe_argv.includes('stream-json'), a.arm);
  }
  assert.equal(out.arms.find((a) => a.arm === 'plain').env.set.ADEV_ROOT, undefined);
  assert.equal(out.arms.find((a) => a.arm === 'full').env.set.ADEV_ROOT, '<ref-worktree>');
  const one = JSON.parse(execFileSync('node', [HARNESS, '--check-isolation', '--arm', 'plain'], { encoding: 'utf8' }));
  assert.deepEqual(one.arms.map((a) => a.arm), ['plain']);
  const r = spawnSync('node', [HARNESS, '--probe'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /USAGE: --probe only applies to --check-isolation/);
});

test('--compare tabulates the arms present and writes nothing', () => {
  const dir = createTempDir();
  try {
    const run = (arm, extra = {}) => ({
      arm,
      ref: 'a'.repeat(40),
      valid: true,
      implement: { process_ms: 120000 },
      metrics: {
        wall_clock_ms: arm === 'plain' ? 120000 : 100000,
        wall_clock_source: arm === 'plain' ? 'process' : 'lifecycle-event-timestamps',
        tokens: { input_tokens: 0, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        quality_gates: { pass: true },
        defects: [],
      },
      ...extra,
    });
    writeJson(dir, 'plain-aaaaaaaaaaaa-1.json', { ...run('plain'), adev: false });
    writeJson(dir, 'lite-aaaaaaaaaaaa-1.json', run('lite'));
    const before = readdirSync(dir).sort();
    const r = spawnSync('node', [HARNESS, '--compare', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^\| lite \| 1\/1 \| 2\.0m \| 1\.7m \|/m);
    assert.match(r.stdout, /^\| plain \| 1\/1 \| 2\.0m \| n\/a \|/m);
    const json = JSON.parse(spawnSync('node', [HARNESS, '--compare', '--json', '--results-dir', dir], { encoding: 'utf8' }).stdout);
    assert.deepEqual(json.rows.map((x) => x.arm), ['lite', 'plain']);
    assert.deepEqual(readdirSync(dir).sort(), before);
  } finally {
    cleanupTempDir(dir);
  }
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
  assert.equal(plan.fixture.liteEligible, 5);
  assert.equal(plan.fixture.liteIneligible, 2);
  assert.equal(plan.fixture.routeEligible, 7);
});

test('EV-1 fixture expectations follow the revision-4 grant and the lite cap under the lite arm only', () => {
  const plan = dryRun();
  assert.deepEqual(
    plan.fixture.taskRoles.map((t) => [t.id, t.role, t.liteArm.provisional, t.liteArm.expectedFinal, t.withoutLite.expectedFinal]),
    [
      ['1', 'lite-eligible', 'lite', 'lite', 'quick'],
      ['2', 'lite-eligible', 'lite', 'lite', 'quick'],
      ['3', 'lite-eligible', 'lite', 'lite', 'quick'],
      ['4', 'lite-eligible', 'lite', 'lite', 'quick'],
      ['5', 'lite-eligible', 'lite', 'lite', 'quick'],
      ['6', 'sensitive-path', 'quick', 'quick', 'full'],
      ['7', 'tripwire-target', 'lite', 'quick', 'quick'],
    ],
  );
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
      ['2', 'sensitive-path', 'quick', 'quick'],
      ['3', 'lite-eligible', 'lite', 'lite'],
    ],
  );
  assert.deepEqual(plan.fixture.taskRoles.map((t) => [t.id, t.withoutLite.expectedFinal]), [['1', 'quick'], ['2', 'full'], ['3', 'quick']]);
  assert.deepEqual(plan.fixture.caseDetails.map((c) => [c.id, c.lite]), [
    ['escalated-lite-code-quality-nonconvergent', true],
    ['stage1-spec-compliance-nonconvergent', false],
  ]);
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

// Body text of every heading at `level`, keyed by heading text. A heading at
// `level` or above ends the current section.
function markdownSections(text, level) {
  const sections = {};
  let current = null;
  for (const line of text.split('\n')) {
    const m = /^(#{1,6}) (.+)$/.exec(line);
    if (m && m[1].length <= level) {
      current = m[1].length === level ? m[2].trim() : null;
      if (current !== null) sections[current] = '';
    } else if (current !== null) {
      sections[current] += `${line}\n`;
    }
  }
  return sections;
}

// The implementer receives the constitution's Non-Negotiable Principles; the
// Stage 1 and synthesized reviewers receive the acceptance criteria and, at
// most, the Coding Standards section. The review can fail on every
// implementation only while the throw-vs-return conflict is split that way.
test('nonconvergent trigger: Principle 4 reaches the implementer and the throwing criteria reach the reviewer', () => {
  const constitution = markdownSections(readFileSync(join(NONCONVERGENT_DIR, 'seed/.context-index/constitution.md'), 'utf8'), 2);
  assert.match(constitution['Non-Negotiable Principles'], /\*\*Errors are values\*\*.*no exported function under `src\/` throws/);
  assert.match(constitution['Non-Negotiable Principles'], /outranks any spec or plan text that says a function throws/);
  assert.match(constitution['Non-Negotiable Principles'], /For the implementer the difference is never a blocker and never a question for the operator/);
  // An orchestrator may copy Principle 4 into the reviewer's prompt; the principle itself must then
  // keep the reviewer from rating the unmet criterion below Important.
  assert.match(constitution['Non-Negotiable Principles'], /A review rates the spec's unmet criterion as an \*\*Important\*\* finding, never lower/);
  assert.doesNotMatch(constitution['Non-Negotiable Principles'], /difference is never a blocker and never a question for the operator\.$/m);
  assert.ok(constitution['Coding Standards'], 'the reviewers need a Coding Standards section to receive');
  assert.doesNotMatch(constitution['Coding Standards'], /throw|error/i);

  const criteria = markdownSections(readFileSync(join(NONCONVERGENT_DIR, 'inventory.spec.md'), 'utf8'), 2)['Acceptance Criteria'];
  assert.match(criteria, /`normalizeSku\("   "\)` throws an `Error` whose `code` is `SKU_INVALID`/);
  assert.match(criteria, /`signAudit\(\{ id: 1 \}, ""\)` throws an `Error` whose `code` is `AUDIT_SECRET_MISSING`/);

  const tasks = markdownSections(readFileSync(join(NONCONVERGENT_DIR, 'inventory.plan.md'), 'utf8'), 3);
  for (const title of ['Task 1: SKU normalization [specialist: none]', 'Task 2: Audit signing [specialist: none]']) {
    assert.ok(tasks[title], title);
    assert.doesNotMatch(tasks[title], /```|throw|error/i, `${title} must not take either side of the conflict`);
  }
});

test('nonconvergent preseeded Task 1 follows Principle 4 and its tests pass on the seed', () => {
  const preseed = join(NONCONVERGENT_DIR, 'preseed/task-1');
  assert.doesNotMatch(readFileSync(join(preseed, 'src/sku.mjs'), 'utf8'), /\bthrow\b/);
  const dir = createTempDir();
  try {
    cpSync(join(NONCONVERGENT_DIR, 'seed'), dir, { recursive: true });
    cpSync(preseed, dir, { recursive: true });
    const r = spawnSync('node', ['--test', 'tests/registry.test.mjs', 'tests/sku.test.mjs'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    cleanupTempDir(dir);
  }
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
