// [local] EV-5 replay tests. They read this repository's routing sidecars and
// git history, which change over time, so they run under `npm run test:evals`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mirrorFileContent } from '../../../lib/sync/provider-skills.mjs';
import { createTempGitRepo, cleanupTempDir } from '../../helpers.mjs';
import { runReplay } from './replay-distribution.mjs';

const REPLAY = join(import.meta.dirname, 'replay-distribution.mjs');
const SPEC = '.context-index/specs/features/demo/demo.spec.md';
const OTHER_SPEC = '.context-index/specs/features/other/other.spec.md';
const PLAN = '.context-index/specs/features/demo/demo.plan.md';
const LOG = '.context-index/lifecycle-state/demo.jsonl';

const EASY = { spec_completeness: 0.8, pattern_coverage: 0.8, blast_radius: 0.8, novelty: 0.8 };

function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

function commit(root, subject, trailers) {
  execFileSync('git', ['add', '-A'], { cwd: root });
  const args = ['commit', '-q', '-m', subject];
  if (trailers.length > 0) args.push('-m', trailers.join('\n'));
  execFileSync('git', args, { cwd: root });
}

function task(n, files) {
  return [
    `### Task ${n}: Task ${n} [specialist: none]`,
    '',
    '**Files:**',
    ...files.map((f) => `- Modify: \`${f}\``),
    '',
    `Do task ${n}.`,
    '',
  ].join('\n');
}

// Seven tasks with known outcomes, all replayed with `lite` authorized on a
// medium-risk spec, so the lite cap holds:
//   1 lite; history touches only declared, exempt and bookkeeping paths -> lite
//   2 lite; history touches an undeclared source file -> quick (scope-mismatch)
//   3 lite; history touches a sensitive path -> quick (sensitive-path, capped)
//   4 lite; no history -> the corpus trip rate
//   5 assisted-agent -> lite; history touches only declared files -> lite
//   6 declares a sensitive path -> quick at the provisional pass (capped); its
//     history touches that path, which must not count as a trip from lite
//   7 lite; history adds an undeclared symlink under tests/ -> quick
function seedDemoRepo() {
  const root = createTempGitRepo();
  write(root, SPEC, '---\nrisk_level: medium\n---\n\n# Demo\n');
  write(root, OTHER_SPEC, '---\nrisk_level: medium\n---\n\n# Other\n');
  write(
    root,
    PLAN,
    [
      '# Plan: Demo',
      '',
      `> **Spec:** ${SPEC}`,
      '',
      task(1, ['src/a.mjs', 'tests/a.test.mjs']),
      task(2, ['src/b.mjs']),
      task(3, ['src/c.mjs']),
      task(4, ['src/d.mjs']),
      task(5, ['src/e.mjs']),
      task(6, ['src/auth/session.mjs']),
      task(7, ['src/g.mjs']),
    ].join('\n'),
  );
  const entry = (id, selected_agent = 'auto-agent') => ({ task_id: id, selected_agent, scores: EASY, rationale: 'r' });
  write(
    root,
    '.context-index/specs/features/demo/demo.routing.json',
    `${JSON.stringify(
      {
        version: 1,
        entries: [entry('1'), entry('2'), entry('3'), entry('4'), entry('5', 'assisted-agent'), entry('6'), entry('7')],
      },
      null,
      2,
    )}\n`,
  );
  write(root, LOG, '{"event":"lifecycle_step","step":"plan","status":"started"}\n');
  commit(root, 'seed', []);

  const trailers = (n, spec = SPEC) => [`Spec: ${spec}`, `Plan-task: ${n}`];

  write(root, 'src/a.mjs', 'export const a = 1;\n');
  write(root, 'tests/a.test.mjs', '// a\n');
  write(root, 'tests/extra.test.mjs', '// undeclared but under tests/\n');
  write(root, 'docs/a.md', 'a\n');
  write(root, 'lib/a.test.mjs', '// test basename\n');
  write(root, LOG, `${readFileSync(join(root, LOG), 'utf8')}{"event":"plan_task","task_id":"1","status":"done"}\n`);
  write(root, PLAN, `${readFileSync(join(root, PLAN), 'utf8')}\n- [x] Task 1\n`);
  commit(root, 'task 1', trailers(1));

  write(root, 'src/b.mjs', 'export const b = 1;\n');
  write(root, 'src/other.mjs', 'export const other = 1;\n');
  commit(root, 'task 2', trailers(2));

  write(root, 'src/c.mjs', 'export const c = 1;\n');
  write(root, 'src/auth/key.mjs', 'export const key = 1;\n');
  commit(root, 'task 3', trailers(3));

  write(root, 'src/e.mjs', 'export const e = 1;\n');
  commit(root, 'task 5', trailers(5));

  write(root, 'src/auth/session.mjs', 'export const session = 1;\n');
  commit(root, 'task 6', trailers(6));

  write(root, 'src/g.mjs', 'export const g = 1;\n');
  symlinkSync('../src/g.mjs', join(root, 'tests/g.test.mjs'));
  commit(root, 'task 7', trailers(7));

  write(root, 'src/unrelated.mjs', 'export const u = 1;\n');
  commit(root, 'other spec, same task number', trailers(4, OTHER_SPEC));
  write(root, 'src/unrelated2.mjs', 'export const u = 2;\n');
  commit(root, 'no spec trailer', ['Plan-task: 4']);
  return root;
}

const SKILL_TEXT = (name) => `---\nname: ${name}\ndescription: "Does ${name} things."\n---\n\n# ${name}\n`;

// Five tasks touching provider mirrors, all lite at the provisional pass:
//   1 declares skills/alpha/SKILL.md; both mirrors are exact regenerations -> lite
//   2 declares skills/beta/SKILL.md; its codex mirror is stale -> quick
//   3 declares src/x.mjs and touches an exact alpha mirror whose canonical it
//     neither declares nor touches -> quick
//   4 declares skills/gamma/SKILL.md; adds an exact-bytes mirror as 100755
//     beside a 100644 canonical -> quick (mode)
//   5 declares skills/delta/SKILL.md; regenerates an existing mirror's bytes
//     exactly but flips it 100644 -> 100755 while the canonical stays
//     100644 -> quick (mode)
//   6 declares skills/eps/SKILL.md, whose canonical is 100755; chmods its
//     drifted 100644 mirror back to 100755, bytes unchanged -> lite
//   7 declares skills/zeta/SKILL.md; its first commit regenerates the mirror
//     exactly, its second edits the canonical again without regenerating it.
//     The task's end state has a stale mirror -> quick
function seedMirrorRepo() {
  const root = createTempGitRepo();
  const spec = '.context-index/specs/features/mirror/mirror.spec.md';
  const tasks = [
    ['skills/alpha/SKILL.md'], ['skills/beta/SKILL.md'], ['src/x.mjs'],
    ['skills/gamma/SKILL.md'], ['skills/delta/SKILL.md'], ['skills/eps/SKILL.md'],
    ['skills/zeta/SKILL.md'],
  ];
  write(root, spec, '---\nrisk_level: medium\n---\n\n# Mirror\n');
  write(
    root,
    '.context-index/specs/features/mirror/mirror.plan.md',
    ['# Plan', '', `> **Spec:** ${spec}`, '', ...tasks.map((files, i) => task(i + 1, files))].join('\n'),
  );
  write(
    root,
    '.context-index/specs/features/mirror/mirror.routing.json',
    `${JSON.stringify({ version: 1, entries: tasks.map((_, i) => ({ task_id: String(i + 1), selected_agent: 'auto-agent', scores: EASY, rationale: 'r' })) })}\n`,
  );
  commit(root, 'seed', []);
  const mirror = (provider, name, text) =>
    write(root, `providers/${provider}/skills/${name}/SKILL.md`, mirrorFileContent(text, provider, name, 'SKILL.md'));
  const trailers = (n) => [`Spec: ${spec}`, `Plan-task: ${n}`];

  write(root, 'skills/alpha/SKILL.md', SKILL_TEXT('alpha'));
  mirror('codex', 'alpha', SKILL_TEXT('alpha'));
  mirror('opencode', 'alpha', SKILL_TEXT('alpha'));
  commit(root, 'task 1', trailers(1));

  write(root, 'skills/beta/SKILL.md', SKILL_TEXT('beta'));
  mirror('codex', 'beta', `${SKILL_TEXT('beta')}stale\n`);
  commit(root, 'task 2', trailers(2));

  write(root, 'src/x.mjs', 'export const x = 1;\n');
  write(root, 'skills/alpha/SKILL.md', `${SKILL_TEXT('alpha')}more\n`);
  commit(root, 'unrelated canonical edit', []);
  mirror('codex', 'alpha', `${SKILL_TEXT('alpha')}more\n`);
  commit(root, 'task 3', trailers(3));

  write(root, 'skills/gamma/SKILL.md', SKILL_TEXT('gamma'));
  mirror('codex', 'gamma', SKILL_TEXT('gamma'));
  chmodSync(join(root, 'providers/codex/skills/gamma/SKILL.md'), 0o755);
  commit(root, 'task 4', trailers(4));

  write(root, 'skills/delta/SKILL.md', SKILL_TEXT('delta'));
  mirror('codex', 'delta', SKILL_TEXT('delta'));
  commit(root, 'delta skill, outside any task', []);
  write(root, 'skills/delta/SKILL.md', `${SKILL_TEXT('delta')}v2\n`);
  mirror('codex', 'delta', `${SKILL_TEXT('delta')}v2\n`);
  chmodSync(join(root, 'providers/codex/skills/delta/SKILL.md'), 0o755);
  commit(root, 'task 5', trailers(5));

  write(root, 'skills/eps/SKILL.md', SKILL_TEXT('eps'));
  chmodSync(join(root, 'skills/eps/SKILL.md'), 0o755);
  mirror('codex', 'eps', SKILL_TEXT('eps'));
  commit(root, 'eps skill with a drifted 100644 mirror, outside any task', []);
  chmodSync(join(root, 'providers/codex/skills/eps/SKILL.md'), 0o755);
  commit(root, 'task 6', trailers(6));

  write(root, 'skills/zeta/SKILL.md', SKILL_TEXT('zeta'));
  mirror('codex', 'zeta', SKILL_TEXT('zeta'));
  commit(root, 'task 7, part 1', trailers(7));
  write(root, 'skills/zeta/SKILL.md', `${SKILL_TEXT('zeta')}v2\n`);
  commit(root, 'task 7, part 2', trailers(7));
  return root;
}

function byTask(result) {
  return Object.fromEntries(result.per_task.map((t) => [t.task_id, t]));
}

test('replay imports the shipped resolver and is deterministic', async () => {
  const a = await runReplay();
  const b = await runReplay();
  assert.deepEqual(a, b);
  assert.ok(a.resolverModule.endsWith('lib/implement/review-depth.mjs'));
  assert.ok(a.per_task.length > 0);
  const sum = a.shares.lite + a.shares.quick + a.shares.full;
  assert.ok(Math.abs(sum - 1) < 0.001, `shares sum to ${sum}`);
});

test('trip computation applies the BEH-7 exemption to trailer-matched commits', async () => {
  const root = seedDemoRepo();
  try {
    const result = await runReplay({ projectRoot: root });
    const t = byTask(result);
    assert.deepEqual(
      Object.fromEntries(Object.entries(t).map(([id, x]) => [id, [x.provisional.depth, x.history?.outcome ?? null, x.final_basis]])),
      {
        1: ['lite', 'lite', 'history'],
        2: ['lite', 'quick', 'history'],
        3: ['lite', 'quick', 'history'],
        4: ['lite', null, 'corpus-rate'],
        5: ['lite', 'lite', 'history'],
        6: ['quick', 'quick', 'history'],
        7: ['lite', 'quick', 'history'],
      },
    );
    assert.deepEqual(t[2].history.legs, ['scope-mismatch']);
    assert.deepEqual(t[3].history.legs, ['sensitive-path']);
    assert.deepEqual(t[7].history.legs, ['scope-mismatch']);
    assert.equal(t[1].history.commits, 1);
    assert.deepEqual(t[6].history.legs, ['sensitive-path']);
    // Only provisionally-lite tasks (1, 2, 3, 5, 7) define the trip rate; task
    // 6's sensitive history is not an escalation from lite. Under the cap no
    // trip reaches full.
    assert.deepEqual(result.trip_rate, { matched_tasks: 5, quick: 0.6, full: 0 });
    assert.deepEqual(t[4].final, { lite: 0.4, quick: 0.6, full: 0 });
    assert.deepEqual(t[5].final, { lite: 1, quick: 0, full: 0 });
    assert.deepEqual(t[6].final, { lite: 0, quick: 1, full: 0 });
    assert.equal(t[6].provisional.depth, 'quick');
    assert.deepEqual(t[6].provisional.floor_legs, ['sensitive-path']);
    assert.equal(t[6].provisional.lite_denied, 'floor:sensitive-path');
    assert.equal(t[5].provisional.lite_denied, null);
  } finally {
    cleanupTempDir(root);
  }
});

test('distribution.json has per-task, per-plan tables and floor-leg tally; a missed target exits 1', () => {
  const root = seedDemoRepo();
  try {
    const out = join(root, 'out', 'distribution.json');
    const r = spawnSync('node', [REPLAY, '--project-root', root, '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /lite 34\.3% \| quick 65\.7% \| full 0\.0%/);
    assert.match(r.stderr, /EV5_TARGET_MISSED/);
    const d = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(d.per_task.length, 7);
    assert.deepEqual(d.per_plan, [
      {
        plan: PLAN,
        spec: SPEC,
        risk_level: 'medium',
        tasks: 7,
        provisional: { lite: 6, quick: 1, full: 0 },
        final: { lite: 2.4, quick: 4.6, full: 0 },
      },
    ]);
    assert.deepEqual(d.provisional_shares, { lite: 0.8571, quick: 0.1429, full: 0 });
    assert.deepEqual(d.shares, { lite: 0.3429, quick: 0.6571, full: 0 });
    assert.deepEqual(d.floor_legs, { provisional: { 'sensitive-path': 1 }, tripwire: { 'scope-mismatch': 2, 'sensitive-path': 1 } });
    assert.deepEqual(d.lite_denied, { 'floor:sensitive-path': 1 });
    assert.deepEqual(d.target, { lite_min: 0.45, full_max: 0.2, met: false });
    assert.deepEqual(d.trip_causes, { src: 1, symlink: 1 });
  } finally {
    cleanupTempDir(root);
  }
});

test('an exact regenerated provider mirror of a task-scoped skill file is not a trip', async () => {
  const root = seedMirrorRepo();
  try {
    const t = byTask(await runReplay({ projectRoot: root }));
    assert.deepEqual([t[1].history.outcome, t[2].history.outcome, t[3].history.outcome], ['lite', 'quick', 'quick']);
    assert.deepEqual(t[1].history.offending, []);
    assert.deepEqual(t[2].history.offending, [{ path: 'providers/codex/skills/beta/SKILL.md', cause: 'provider-mirror-not-exact' }]);
    assert.deepEqual(t[3].history.offending, [
      { path: 'providers/codex/skills/alpha/SKILL.md', cause: 'provider-mirror-canonical-out-of-scope' },
    ]);
  } finally {
    cleanupTempDir(root);
  }
});

test('a provider mirror whose git mode moves away from the canonical\'s is a trip; one brought back to it is not', async () => {
  const root = seedMirrorRepo();
  try {
    const t = byTask(await runReplay({ projectRoot: root }));
    assert.deepEqual(t[4].history.offending, [{ path: 'providers/codex/skills/gamma/SKILL.md', cause: 'provider-mirror-mode' }]);
    assert.deepEqual(t[5].history.offending, [{ path: 'providers/codex/skills/delta/SKILL.md', cause: 'provider-mirror-mode' }]);
    assert.equal(t[4].history.outcome, 'quick');
    assert.equal(t[5].history.outcome, 'quick');
    assert.deepEqual(t[6].history.offending, []);
    assert.equal(t[6].history.outcome, 'lite');
  } finally {
    cleanupTempDir(root);
  }
});

test('a mirror is judged against the task\'s newest commit, so a later canonical edit without regeneration trips', async () => {
  const root = seedMirrorRepo();
  try {
    const t = byTask(await runReplay({ projectRoot: root }));
    assert.equal(t[7].history.commits, 2);
    assert.deepEqual(t[7].history.offending, [{ path: 'providers/codex/skills/zeta/SKILL.md', cause: 'provider-mirror-not-exact' }]);
    assert.equal(t[7].history.outcome, 'quick');
  } finally {
    cleanupTempDir(root);
  }
});

test('the replay reads plans, specs and sidecars at the ref, never the working tree', async () => {
  const root = seedDemoRepo();
  try {
    const before = await runReplay({ projectRoot: root });
    write(root, SPEC, '---\nrisk_level: high\n---\n');
    write(root, '.context-index/specs/features/demo/demo.routing.json', '{ not json');
    write(root, '.context-index/specs/features/extra/extra.routing.json', '{"version":1,"entries":[]}\n');
    write(root, '.context-index/specs/features/extra/extra.plan.md', '# Plan\n');
    const after = await runReplay({ projectRoot: root });
    assert.deepEqual(after, before);
  } finally {
    cleanupTempDir(root);
  }
});
