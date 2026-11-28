import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import {
  ARMS,
  armPrompt,
  armSpawnSpec,
  classifyRun,
  claudeArgv,
  compareArms,
  costWeightedTokens,
  createPlainBin,
  edgeProbeManifest,
  edgeProbeResults,
  envDelta,
  findArm,
  implementPrompt,
  installedAdevPluginIds,
  isolationEvidence,
  isolationPlan,
  isolationSettings,
  judgeIsolation,
  parseStreamJson,
  parseTapIds,
  parseTestCounts,
  plainPrompt,
  plainTrialEnv,
  renderCompareTable,
  runPatch,
  runWallClock,
  summarizeArm,
} from '../../evals/implement-rigor-ladder/run-ab-eval.mjs';

const EVAL_DIR = join(import.meta.dirname, '../../evals/implement-rigor-ladder');
const SEED = join(EVAL_DIR, 'fixture/seed');
const PROBES = join(EVAL_DIR, 'fixture/probes');
const EDGE_PROBES = join(EVAL_DIR, 'fixture/edge-probes');
const REFERENCE = join(import.meta.dirname, '../../fixtures/evals/implement-rigor-ladder-reference/src');

const plain = findArm('plain');
const full = findArm('full');

function configDirWith({ installed = {}, enabled = null } = {}) {
  const dir = createTempDir();
  mkdirSync(join(dir, 'plugins'), { recursive: true });
  writeFileSync(join(dir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }));
  if (enabled) writeFileSync(join(dir, 'settings.json'), JSON.stringify({ enabledPlugins: enabled }));
  return dir;
}

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const argAfter = (argv, flag) => argv[argv.indexOf(flag) + 1];

test('installedAdevPluginIds finds every adev id in installed_plugins.json and settings.json, and keeps the default', () => {
  const dir = configDirWith({
    installed: { 'adev@agentic-development': [{ scope: 'project' }], 'adev@fork': [{ scope: 'user' }], 'fde-kit@fde-kit': [{ scope: 'user' }] },
    enabled: { 'adev@local-mkt': true, 'fde-kit@fde-kit': true, 'adevish@x': true },
  });
  const empty = createTempDir();
  try {
    assert.deepEqual(installedAdevPluginIds(dir), ['adev@agentic-development', 'adev@fork', 'adev@local-mkt']);
    assert.deepEqual(installedAdevPluginIds(empty), ['adev@agentic-development']);
    assert.deepEqual(isolationSettings(installedAdevPluginIds(dir)), {
      enabledPlugins: { 'adev@agentic-development': false, 'adev@fork': false, 'adev@local-mkt': false },
    });
  } finally {
    cleanupTempDir(dir);
    cleanupTempDir(empty);
  }
});

test('the plain arm spawns with no --plugin-dir, the adev-disabling settings, no ADEV_* env and the stub bin first', () => {
  const configDir = configDirWith({ installed: { 'adev@agentic-development': [{}], 'adev@fork': [{}] } });
  try {
    const spec = withEnv({ ADEV_ROOT: '/somewhere/adev', ADEV_EXTRA: '1', CLAUDE_PLUGIN_ROOT: '/x' }, () =>
      armSpawnSpec({ arm: plain, pluginRoot: '/ref', shimBin: '/shim', plainBin: '/plain-bin', cwd: '/sandbox', configDir }));
    assert.equal(spec.command, 'claude');
    assert.ok(!spec.argv.includes('--plugin-dir'));
    assert.deepEqual(JSON.parse(argAfter(spec.argv, '--settings')), {
      enabledPlugins: { 'adev@agentic-development': false, 'adev@fork': false },
    });
    assert.ok(spec.argv.includes('--dangerously-skip-permissions'));
    assert.equal(argAfter(spec.argv, '-p'), plainPrompt());
    assert.equal(spec.env.ADEV_ROOT, undefined);
    assert.equal(spec.env.ADEV_EXTRA, undefined);
    assert.equal(spec.env.CLAUDE_PLUGIN_ROOT, undefined);
    assert.ok(spec.env.PATH.startsWith('/plain-bin:'));
    assert.ok(!spec.env.PATH.split(':').includes('/shim'));
    assert.equal(spec.env.PWD, '/sandbox');
    assert.equal(spec.env.CLAUDECODE, undefined);
  } finally {
    cleanupTempDir(configDir);
  }
});

test('the adev arms load only the --plugin-dir copy: one --plugin-dir, every installed adev id disabled', () => {
  const configDir = configDirWith({ installed: { 'adev@agentic-development': [{}] }, enabled: { 'adev@agentic-development': true } });
  try {
    for (const arm of ARMS.filter((a) => a.adev)) {
      const spec = armSpawnSpec({ arm, pluginRoot: '/ref', shimBin: '/shim', plainBin: '/plain-bin', cwd: '/sandbox', configDir, model: 'opus' });
      assert.equal(spec.argv.filter((a) => a === '--plugin-dir').length, 1, arm.id);
      assert.equal(argAfter(spec.argv, '--plugin-dir'), '/ref');
      assert.deepEqual(JSON.parse(argAfter(spec.argv, '--settings')), { enabledPlugins: { 'adev@agentic-development': false } });
      assert.equal(argAfter(spec.argv, '--model'), 'opus');
      assert.equal(argAfter(spec.argv, '-p'), implementPrompt(arm));
      assert.equal(spec.env.ADEV_ROOT, '/ref');
      assert.ok(spec.env.PATH.startsWith('/shim:'));
    }
  } finally {
    cleanupTempDir(configDir);
  }
});

test('claudeArgv: stream-json adds --verbose, the model flag is optional, an adev spawn needs a plugin root', () => {
  const settings = isolationSettings(['adev@agentic-development']);
  const streamed = claudeArgv({ prompt: 'p', adev: false, settings, stream: true });
  assert.equal(argAfter(streamed, '--output-format'), 'stream-json');
  assert.ok(streamed.includes('--verbose'));
  assert.ok(!streamed.includes('--model'));
  const json = claudeArgv({ prompt: 'p', pluginRoot: '/r', settings });
  assert.equal(argAfter(json, '--output-format'), 'json');
  assert.ok(!json.includes('--verbose'));
  assert.deepEqual(json.slice(-4), ['--plugin-dir', '/r', '-p', 'p']);
  assert.throws(() => claudeArgv({ prompt: 'p', settings }), /USAGE/);
});

test('the plain bin\'s adev stub shadows any installed adev and exits 127', () => {
  const { bin } = createPlainBin();
  try {
    const env = plainTrialEnv({ plainBin: bin, cwd: bin });
    const which = spawnSync('/bin/bash', ['-c', 'command -v adev'], { env, encoding: 'utf8' });
    assert.equal(which.stdout.trim(), join(bin, 'adev'));
    const r = spawnSync('/bin/bash', ['-c', 'adev help'], { env, encoding: 'utf8' });
    assert.equal(r.status, 127);
    assert.match(r.stderr, /adev: command not found/);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});

test('envDelta names what a spawn sets and removes, with a prepended PATH shown against $PATH', () => {
  const base = { PATH: '/usr/bin', HOME: '/h', CLAUDECODE: '1' };
  assert.deepEqual(envDelta({ PATH: '/stub:/usr/bin', HOME: '/h', SHELL: '/bin/bash' }, base), {
    set: { PATH: '/stub:$PATH', SHELL: '/bin/bash' },
    removed: ['CLAUDECODE'],
  });
});

test('the plain prompt asks for the plan, the spec and per-task commits, unattended, in adev-free words', () => {
  const lines = plainPrompt().split('\n');
  assert.equal(
    lines[0],
    'Implement every task in the plan at .context-index/specs/features/example/example.plan.md, following the spec at .context-index/specs/features/example/example.spec.md. Commit each task separately.',
  );
  assert.equal(lines[1], '');
  const statement = lines.slice(2).join('\n');
  assert.match(statement, /unattended evaluation run/);
  assert.match(statement, /Do not wait for input/);
  assert.match(statement, /if a task looks already implemented, do not skip it/);
  assert.doesNotMatch(plainPrompt(), /adev|\/adev:|assisted-agent|REQUIRES HUMAN APPROVAL|--lite|--tier|review depth/i);
  assert.equal(armPrompt(plain), plainPrompt());
  assert.equal(armPrompt(full), implementPrompt(full));
});

test('classifyRun without a verdict requirement judges a plain run on exit, commits, session and transcripts', () => {
  const ok = { exitCode: 0, verdict: null, taskCommits: 7, sessionId: 's', transcripts: 1 };
  const plainRule = { requireVerdict: false };
  assert.deepEqual(classifyRun(ok, plainRule), { valid: true, reasons: [] });
  assert.deepEqual(classifyRun(ok), { valid: false, reasons: ['implement-verdict-not-pass'] });
  assert.deepEqual(classifyRun({ ...ok, exitCode: null }, plainRule), { valid: false, reasons: ['implement-exit-nonzero'] });
  assert.deepEqual(classifyRun({ ...ok, taskCommits: 0 }, plainRule), { valid: false, reasons: ['no-task-commits'] });
  assert.deepEqual(classifyRun({ ...ok, sessionId: null }, plainRule), { valid: false, reasons: ['no-session-id'] });
  assert.deepEqual(classifyRun({ ...ok, transcripts: 0 }, plainRule), { valid: false, reasons: ['no-transcripts'] });
});

test('runWallClock records process time for plain and the lifecycle span, or none, for adev arms', () => {
  assert.deepEqual(runWallClock({ arm: plain, lifecycleMs: null, processMs: 900 }), { wall_clock_ms: 900, wall_clock_source: 'process' });
  assert.deepEqual(runWallClock({ arm: full, lifecycleMs: 800, processMs: 900 }), { wall_clock_ms: 800, wall_clock_source: 'lifecycle-event-timestamps' });
  assert.deepEqual(runWallClock({ arm: full, lifecycleMs: null, processMs: 900 }), { wall_clock_ms: null, wall_clock_source: 'none' });
});

test('parseTestCounts reads the spec and TAP summaries and returns null without one', () => {
  assert.deepEqual(parseTestCounts('✔ a\nℹ tests 8\nℹ suites 0\nℹ pass 7\nℹ fail 1\n'), { total: 8, pass: 7, fail: 1 });
  assert.deepEqual(parseTestCounts('ok 1 - a\n# tests 3\n# pass 3\n# fail 0\n'), { total: 3, pass: 3, fail: 0 });
  assert.equal(parseTestCounts('npm ERR! missing script: test'), null);
});

test('parseTapIds keeps top-level probe lines only', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: P1: x',
    'ok 1 - P1: x',
    'not ok 2 - P2: y',
    '    ok 1 - P9: nested',
    'not ok 1 - .ev1-edge-probes/beh3-slug.edge.mjs',
    'ok 3 - K10: z',
  ].join('\n');
  assert.deepEqual(parseTapIds(tap), { P1: 'pass', P2: 'fail', K10: 'pass' });
});

test('every edge probe id in probes.json is exactly one test of its file, and vice versa', () => {
  const manifest = edgeProbeManifest();
  const ids = manifest.probes.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const file of Object.keys(manifest.files)) {
    const names = [...readFileSync(join(EDGE_PROBES, file), 'utf8').matchAll(/^test\('([A-Z]+\d+): /gm)].map((m) => m[1]);
    assert.deepEqual(names, manifest.probes.filter((p) => p.file === file).map((p) => p.id), file);
  }
  assert.deepEqual(manifest.probes.filter((p) => p.strict).map((p) => p.id), ['P6', 'T8', 'T9', 'L6']);
  assert.equal(manifest.probes.find((p) => p.id === 'P6').behavior, 'BEH-1');
});

function sandboxFrom(...overlays) {
  const dir = createTempDir();
  cpSync(SEED, dir, { recursive: true });
  for (const o of overlays) cpSync(o, join(dir, 'src'), { recursive: true });
  return dir;
}

test('the spec-conforming reference passes every edge probe and every seeded-defect probe', () => {
  const dir = sandboxFrom(REFERENCE);
  try {
    const edge = edgeProbeResults(dir);
    assert.deepEqual(edge.failed, []);
    assert.equal(edge.passed, 54);
    assert.equal(edge.passed_excluding_strict, edge.total_excluding_strict);
    assert.equal(spawnSync('npm', ['test'], { cwd: dir, encoding: 'utf8' }).status, 0);
    mkdirSync(join(dir, '.ev1-probes'));
    cpSync(PROBES, join(dir, '.ev1-probes'), { recursive: true });
    const r = spawnSync('node', ['--test', '.ev1-probes'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
  } finally {
    cleanupTempDir(dir);
  }
});

test('on the bare seed the edge probes fail where the seed departs from the spec, and the dir is removed again', () => {
  const dir = sandboxFrom();
  try {
    const edge = edgeProbeResults(dir);
    assert.deepEqual(edge.failed, [
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
      'C2', 'C3', 'C5', 'C6', 'C7', 'C8',
      'S1', 'S2', 'S3', 'S4', 'S5',
      'K2', 'K3', 'K7', 'K8', 'K9', 'K10',
      'F1', 'F2', 'F3', 'F4', 'F5',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9',
      'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8',
    ]);
    assert.deepEqual(edge.by_behavior['BEH-4'], { total: 10, passed: 4, failed: ['K2', 'K3', 'K7', 'K8', 'K9', 'K10'] });
    assert.deepEqual(edge.by_behavior['BEH-7'].failed.length, 8);
    assert.equal(edge.total, 54);
    assert.equal(edge.passed, 8);
    assert.throws(() => readFileSync(join(dir, '.ev1-edge-probes', 'probes.json')));
  } finally {
    cleanupTempDir(dir);
  }
});

test('a missing export fails only the probes that need it', () => {
  const dir = sandboxFrom(REFERENCE);
  try {
    writeFileSync(join(dir, 'src', 'pagination.mjs'), 'export function pageCount(t, s) { return t === 0 ? 0 : Math.ceil(t / s); }\n');
    const edge = edgeProbeResults(dir);
    assert.deepEqual(edge.by_behavior['BEH-1'].failed, ['P3', 'P4', 'P5', 'P6', 'P7']);
  } finally {
    cleanupTempDir(dir);
  }
});

function gitIn(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

test('runPatch diffs runBase..HEAD without .context-index/ and lists what was left uncommitted', () => {
  const dir = createTempDir();
  try {
    gitIn(dir, ['init', '-q', '-b', 'main']);
    gitIn(dir, ['config', 'user.name', 't']);
    gitIn(dir, ['config', 'user.email', 't@localhost']);
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, '.context-index', 'lifecycle-state'), { recursive: true });
    writeFileSync(join(dir, 'src', 'a.mjs'), 'export const a = 1;\n');
    writeFileSync(join(dir, '.context-index', 'lifecycle-state', 'example.jsonl'), '{}\n');
    gitIn(dir, ['add', '-A']);
    gitIn(dir, ['commit', '-q', '-m', 'seed']);
    const base = gitIn(dir, ['rev-parse', 'HEAD']);
    writeFileSync(join(dir, 'src', 'a.mjs'), 'export const a = 2;\n');
    writeFileSync(join(dir, 'src', 'b.mjs'), 'export const b = 1;\n');
    writeFileSync(join(dir, '.context-index', 'lifecycle-state', 'example.jsonl'), '{}\n{"event":"x"}\n');
    gitIn(dir, ['add', '-A']);
    gitIn(dir, ['commit', '-q', '-m', 'feat: a', '-m', 'Spec: .context-index/specs/x.spec.md']);
    writeFileSync(join(dir, 'src', 'c.mjs'), 'export const c = 1;\n');
    writeFileSync(join(dir, '.context-index', 'note.md'), 'x\n');

    const patch = runPatch(dir, base);
    assert.deepEqual(patch.files, ['src/a.mjs', 'src/b.mjs']);
    assert.match(patch.text, /^diff --git a\/src\/a\.mjs b\/src\/a\.mjs$/m);
    assert.match(patch.text, /^\+export const a = 2;$/m);
    assert.doesNotMatch(patch.text, /context-index|lifecycle-state|Spec:/);
    assert.deepEqual(patch.uncommitted, ['src/c.mjs']);
    assert.equal(patch.head, gitIn(dir, ['rev-parse', 'HEAD']));
    const applied = createTempDir();
    try {
      gitIn(applied, ['init', '-q']);
      writeFileSync(join(applied, 'p.patch'), patch.text);
      mkdirSync(join(applied, 'src'));
      writeFileSync(join(applied, 'src', 'a.mjs'), 'export const a = 1;\n');
      gitIn(applied, ['apply', 'p.patch']);
      assert.equal(readFileSync(join(applied, 'src', 'b.mjs'), 'utf8'), 'export const b = 1;\n');
    } finally {
      cleanupTempDir(applied);
    }
  } finally {
    cleanupTempDir(dir);
  }
});

const tok = (input, output, write, read) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: write,
  cache_read_input_tokens: read,
});

test('costWeightedTokens weights input 1, cache write 1.25, cache read 0.1 and output 5', () => {
  assert.equal(costWeightedTokens(tok(100, 10, 1000, 10000)), 100 + 50 + 1250 + 1000);
  assert.equal(costWeightedTokens(null), null);
});

function result(arm, { processMs, lifecycleMs, source, tokens = tok(0, 1000, 0, 0), gates = true, defects = [], edge = null, tests = null, valid = true, validate = null }) {
  return {
    arm,
    ...(arm === 'plain' ? { adev: false } : {}),
    ref: 'f'.repeat(40),
    valid,
    implement: { process_ms: processMs },
    metrics: {
      wall_clock_ms: lifecycleMs,
      ...(source ? { wall_clock_source: source, process_wall_clock_ms: processMs } : {}),
      agent_dispatches: arm === 'plain' ? 2 : 10,
      tokens,
      quality_gates: { pass: gates, tests },
      defects,
      ...(edge ? { edge_probes: edge } : {}),
    },
    validate,
  };
}

test('compareArms builds one informational row per arm present, in arm order', () => {
  const caught = (...at) => at.map((c, i) => ({ id: `D${i + 1}`, caught_at: c }));
  const rows = compareArms(
    {
      full: [
        result('full', { processMs: 1000, lifecycleMs: 900, tokens: tok(0, 100, 0, 0), defects: caught('implement', 'validate', 'implement', 'implement'), validate: { tokens: tok(0, 20, 0, 0) } }),
        result('full', { processMs: 3000, lifecycleMs: 2900, tokens: tok(0, 300, 0, 0), defects: caught('implement', 'implement', 'implement', 'implement') }),
      ],
      plain: [
        result('plain', { processMs: 500, lifecycleMs: 500, source: 'process', defects: caught('escaped', 'implement', 'implement', 'implement'), edge: { total: 54, passed: 50 }, tests: { total: 30 } }),
        result('plain', { processMs: 700, lifecycleMs: 700, source: 'process', defects: caught('escaped', 'escaped', 'implement', 'implement'), edge: { total: 54, passed: 40 }, tests: { total: 20 }, gates: false }),
        result('plain', { processMs: 99999, lifecycleMs: 99999, source: 'process', valid: false, gates: false }),
      ],
    },
    { judgeByArm: { plain: { overall: 6.5, patches: 2 } } },
  );
  assert.deepEqual(rows.map((r) => r.arm), ['full', 'plain']);
  const [f, p] = rows;
  assert.equal(f.median_process_wall_clock_ms, 2000);
  assert.equal(f.median_lifecycle_wall_clock_ms, 1900);
  assert.equal(f.median_weighted_tokens, 1000);
  assert.equal(f.median_weighted_tokens_incl_validate, 1050);
  assert.equal(f.median_output_tokens, 200);
  assert.equal(f.validate_runs, 1);
  assert.equal(f.median_defects_missed_at_implement, 0.5);
  assert.equal(f.median_defects_escaped, 0);
  assert.equal(f.edge_probe_pass_rate, null);
  assert.equal(f.judge_overall_mean, null);
  assert.equal(p.runs, 3);
  assert.equal(p.valid_runs, 2);
  assert.equal(p.median_process_wall_clock_ms, 600);
  assert.equal(p.median_lifecycle_wall_clock_ms, null);
  assert.equal(p.quality_gates_pass_rate, 0.3333);
  assert.equal(p.median_defects_missed_at_implement, 1.5);
  assert.equal(p.median_defects_escaped, 1.5);
  assert.equal(p.edge_probe_pass_rate, round(90 / 108));
  assert.equal(p.edge_probe_runs, 2);
  assert.equal(p.median_tests, 25);
  assert.equal(p.judge_overall_mean, 6.5);

  const table = renderCompareTable(rows);
  assert.match(table, /^\| arm \| runs\/valid \| process wall \| lifecycle wall \|/);
  assert.match(table, /^\| plain \| 3\/2 \| 0\.0m \| n\/a \| 5\.0k \|/m);
  assert.match(table, /83\.3% \(2 runs\)/);
  assert.match(table, /6\.50 \(2 patches\)/);
  assert.match(table, /never read the plain arm/);
});

function round(x) {
  return Math.round(x * 1e4) / 1e4;
}

test('the plain arm never reaches the EV-1 threshold summary', () => {
  const plainRun = result('plain', { processMs: 1, lifecycleMs: 1, source: 'process' });
  assert.equal(summarizeArm([plainRun]).median_wall_clock_ms, 1);
  assert.ok(!['quick', 'lite'].includes(plain.id));
});

test('parseStreamJson finds the init message and the last result', () => {
  const out = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's', plugins: [] }),
    JSON.stringify({ type: 'assistant', message: {} }),
    JSON.stringify({ type: 'result', session_id: 's', result: 'NONE' }),
    '{"type":"res',
  ].join('\n');
  const { init, result: r } = parseStreamJson(out);
  assert.equal(init.session_id, 's');
  assert.equal(r.result, 'NONE');
  assert.deepEqual(parseStreamJson(''), { init: null, result: null });
});

function transcript(dir, rows) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(file, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n');
  return file;
}

const listing = (...names) => ({
  type: 'attachment',
  attachment: { type: 'skill_listing', content: names.map((n) => `- ${n}: does things`).join('\n') },
});

test('isolationEvidence and judgeIsolation accept a clean plain session and a single-copy adev session', () => {
  const dir = createTempDir();
  try {
    const plainEvidence = isolationEvidence({
      init: { slash_commands: ['/init', 'review', 'fde-kit:fde-assets'], skills: ['dataviz'], plugins: [{ name: 'fde-kit', path: '/c/fde' }] },
      transcriptPaths: [transcript(dir, [listing('dataviz', 'fde-kit:fde-assets')])],
    });
    assert.deepEqual(plainEvidence.adev_commands, []);
    assert.deepEqual(plainEvidence.adev_plugins, []);
    assert.deepEqual(judgeIsolation({ arm: plain, evidence: plainEvidence, pluginRoot: '/ref' }), { arm: 'plain', ok: true, failures: [] });

    const adevEvidence = isolationEvidence({
      init: { slash_commands: ['adev:implement', 'adev:validate', 'init'], plugins: [{ name: 'adev', path: dir }] },
      transcriptPaths: [transcript(dir, [
        listing('adev:implement', 'adev:validate', 'dataviz'),
        { type: 'attachment', attachment: { type: 'hook_additional_context', content: ['---\nname: using-adev\n'] } },
        listing('adev:implement'),
      ])],
    });
    assert.deepEqual(adevEvidence.adev_listing, ['adev:implement', 'adev:validate']);
    assert.deepEqual(adevEvidence.duplicate_adev_names, []);
    assert.equal(adevEvidence.using_adev_contexts, 1);
    assert.equal(judgeIsolation({ arm: full, evidence: adevEvidence, pluginRoot: dir }).ok, true);
  } finally {
    cleanupTempDir(dir);
  }
});

test('judgeIsolation names each leak: adev in the plain arm, a second or installed copy in an adev arm, no evidence', () => {
  const dir = createTempDir();
  try {
    const leaked = isolationEvidence({
      init: { slash_commands: ['/adev:implement'], plugins: [{ name: 'adev', path: '/home/u/.claude/plugins/cache/agentic-development/adev/0.28.1' }] },
      transcriptPaths: [transcript(dir, [
        listing('adev:implement'),
        { type: 'attachment', attachment: { type: 'hook_additional_context', content: 'name: using-adev' } },
        '{"cwd":"/home/u/.claude/plugins/cache/agentic-development/adev/0.28.1/skills/implement"}',
      ])],
    });
    const plainVerdict = judgeIsolation({ arm: plain, evidence: leaked, pluginRoot: '/ref' });
    assert.equal(plainVerdict.ok, false);
    assert.equal(plainVerdict.failures.length, 5);

    const doubled = isolationEvidence({
      init: { slash_commands: ['adev:implement', 'adev:implement'], plugins: [{ name: 'adev', path: dir }, { name: 'adev', path: '/elsewhere' }] },
      transcriptPaths: [transcript(dir, [listing('adev:implement', 'adev:implement')])],
    });
    const fullVerdict = judgeIsolation({ arm: full, evidence: doubled, pluginRoot: dir });
    assert.equal(fullVerdict.ok, false);
    assert.deepEqual(fullVerdict.failures, ['expected one adev plugin, saw 2', 'adev names listed twice: adev:implement']);

    const wrongRoot = isolationEvidence({ init: { slash_commands: ['adev:implement'], plugins: [{ name: 'adev', path: '/elsewhere' }] } });
    assert.match(judgeIsolation({ arm: full, evidence: wrongRoot, pluginRoot: dir }).failures[0], /loaded from \/elsewhere/);

    const none = isolationEvidence({});
    assert.match(judgeIsolation({ arm: plain, evidence: none, pluginRoot: dir }).failures[0], /^no-evidence/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('isolationPlan prints the run and probe argv per arm with placeholders and the installed adev scopes', () => {
  const configDir = configDirWith({ installed: { 'adev@agentic-development': [{ scope: 'project', projectPath: '/p' }] } });
  try {
    const plan = isolationPlan({ configDir, model: 'sonnet' });
    assert.deepEqual(plan.installed_adev, [
      { id: 'adev@agentic-development', installs: [{ scope: 'project', projectPath: '/p' }], user_settings_enabled: null },
    ]);
    const byArm = Object.fromEntries(plan.arms.map((a) => [a.arm, a]));
    assert.deepEqual(Object.keys(byArm), ['full', 'quick', 'lite', 'plain']);
    assert.equal(argAfter(byArm.full.run_argv, '--plugin-dir'), '<ref-worktree>');
    assert.ok(!byArm.plain.run_argv.includes('--plugin-dir'));
    assert.equal(argAfter(byArm.plain.probe_argv, '--output-format'), 'stream-json');
    assert.equal(argAfter(byArm.plain.run_argv, '--model'), 'sonnet');
    assert.equal(byArm.plain.env.set.PATH.split(':')[0], '<plain-bin>');
    assert.equal(byArm.lite.env.set.PATH.split(':')[0], '<adev-shim-bin>');
  } finally {
    cleanupTempDir(configDir);
  }
});
