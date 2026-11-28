import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir } from '../../helpers.mjs';
import {
  anonymizePatch,
  collectEntries,
  DIMENSIONS,
  dryRunReport,
  judgeArgv,
  judgeEntries,
  judgeOverallByArm,
  latestJudgeFile,
  parseJudgeOutput,
  renderSummary,
  shuffled,
  splitPatch,
  summarizeJudge,
  summarizeTrials,
} from '../../evals/implement-rigor-ladder/judge-runs.mjs';

const EVAL_DIR = join(import.meta.dirname, '../../evals/implement-rigor-ladder');
const JUDGE = join(EVAL_DIR, 'judge-runs.mjs');
const COMMITTED_RESULTS = join(EVAL_DIR, 'results');

const section = (path, lines) =>
  [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,1 +1,${lines.length} @@`,
    ...lines,
    '',
  ].join('\n');

const PATCH = [
  section('.context-index/lifecycle-state/example.jsonl', ['+{"event":"plan_task","task_id":"1"}']),
  section('src/pagination.mjs', [
    '-export function pageCount() {}',
    '+// Spec: .context-index/specs/features/example/example.spec.md',
    '+// Plan-task: 1, implemented by /adev:implement --lite (see adev docs)',
    '+export function pageCount(total, pageSize) {',
    '+  return total === 0 ? 0 : Math.ceil(total / pageSize);',
    '+}',
  ]),
  section('CLAUDE.md', ['+# adev context']),
  section('tests/pagination.test.mjs', ["+test('pageCount(10, 5) is 2', () => {});"]),
  section('.ev1-edge-probes/beh1-pagination.edge.mjs', ['+x']),
].join('');

test('splitPatch yields one section per file with its path', () => {
  assert.deepEqual(splitPatch(PATCH).map((s) => s.path), [
    '.context-index/lifecycle-state/example.jsonl',
    'src/pagination.mjs',
    'CLAUDE.md',
    'tests/pagination.test.mjs',
    '.ev1-edge-probes/beh1-pagination.edge.mjs',
  ]);
  assert.deepEqual(splitPatch(''), []);
});

test('anonymizePatch drops bookkeeping sections and redacts arm-identifying text in place', () => {
  const anon = anonymizePatch(PATCH);
  assert.deepEqual(anon.kept, ['src/pagination.mjs', 'tests/pagination.test.mjs']);
  assert.deepEqual(anon.dropped, ['.context-index/lifecycle-state/example.jsonl', 'CLAUDE.md', '.ev1-edge-probes/beh1-pagination.edge.mjs']);
  assert.doesNotMatch(anon.text, /adev|\.context-index|Spec:|Plan-task:|--lite|lifecycle-state/i);
  assert.match(anon.text, /^\+export function pageCount\(total, pageSize\) \{$/m);
  const src = splitPatch(anon.text).find((s) => s.path === 'src/pagination.mjs');
  const original = splitPatch(PATCH).find((s) => s.path === 'src/pagination.mjs');
  assert.equal(src.text.split('\n').length, original.text.split('\n').length, 'hunk line counts stay valid');
  assert.equal(anon.redactions, 2, 'the Spec: and Plan-task: rules each take the rest of their line');
  assert.equal(anon.bytes, Buffer.byteLength(anon.text));
  const loose = anonymizePatch(section('src/a.mjs', ['+// see /adev:implement and .context-index/specs/a.md, run with --tier full or --lite']));
  assert.equal(loose.text.split('\n')[5], '+// see [redacted] and [redacted-path] run with [redacted] or [redacted]');
});

const reply = (scores, overall = 7, extra = '') =>
  `${extra}\`\`\`json\n${JSON.stringify({
    dimensions: Object.fromEntries(DIMENSIONS.map((d, i) => [d, { score: scores[i], evidence: [`src/x.mjs line ${i}`] }])),
    overall: { score: overall, rationale: 'r' },
  })}\n\`\`\`\n`;

test('parseJudgeOutput accepts a fenced or bare JSON reply and rejects incomplete ones', () => {
  const ok = parseJudgeOutput(reply([8, 7, 6, 9, 10], 8, 'Here is my verdict.\n'));
  assert.equal(ok.ok, true);
  assert.equal(ok.scores.spec_compliance.score, 8);
  assert.deepEqual(ok.scores.scope_discipline.evidence, ['src/x.mjs line 4']);
  assert.equal(ok.overall.score, 8);

  const bare = JSON.parse(reply([1, 2, 3, 4, 5]).replace(/^```json\n|\n```\n$/g, ''));
  bare.dimensions.code_clarity.evidence = 'one string';
  const parsedBare = parseJudgeOutput(`prefix ${JSON.stringify(bare)} suffix`);
  assert.equal(parsedBare.ok, true);
  assert.deepEqual(parsedBare.scores.code_clarity.evidence, ['one string']);

  const noEvidence = JSON.parse(JSON.stringify(bare));
  noEvidence.dimensions.test_quality.evidence = [];
  assert.match(parseJudgeOutput(JSON.stringify(noEvidence)).error, /test_quality: no evidence/);
  const outOfRange = JSON.parse(JSON.stringify(bare));
  outOfRange.dimensions.spec_compliance.score = 11;
  outOfRange.overall = {};
  assert.match(parseJudgeOutput(JSON.stringify(outOfRange)).error, /spec_compliance: score missing or outside 0\.\.10; overall/);
  assert.deepEqual(parseJudgeOutput('I cannot judge this.'), { ok: false, error: 'no JSON object in the reply' });
});

test('summarizeTrials takes the mean and spread over the trials that parsed', () => {
  const a = parseJudgeOutput(reply([8, 6, 6, 9, 10], 8));
  const b = parseJudgeOutput(reply([6, 6, 7, 9, 9], 6));
  const s = summarizeTrials([a, b]);
  assert.equal(s.ok_trials, 2);
  assert.equal(s.mean.spec_compliance, 7);
  assert.equal(s.mean.overall, 7);
  assert.equal(s.spread.spec_compliance, 2);
  assert.equal(s.spread.correctness_robustness, 0);
  const one = summarizeTrials([a, { ok: false, error: 'x' }]);
  assert.equal(one.ok_trials, 1);
  assert.equal(one.mean.overall, 8);
  assert.equal(one.spread.overall, null);
});

test('shuffled is a seeded permutation', () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(shuffled(items, 42), shuffled(items, 42));
  assert.notDeepEqual(shuffled(items, 42), items);
  assert.deepEqual([...shuffled(items, 7)].sort((x, y) => x - y), items);
});

function resultsDir() {
  const dir = createTempDir();
  const write = (name, body) => writeFileSync(join(dir, name), typeof body === 'string' ? body : `${JSON.stringify(body)}\n`);
  write('plain-aaaaaaaaaaaa-1.json', { arm: 'plain', ref: 'a'.repeat(40), patch: { path: 'plain-aaaaaaaaaaaa-1.patch' } });
  write('plain-aaaaaaaaaaaa-1.patch', PATCH);
  write('lite-bbbbbbbbbbbb-2.json', { arm: 'lite', ref: 'b'.repeat(40), patch: { path: null } });
  write('lite-bbbbbbbbbbbb-2.patch', PATCH);
  write('full-cccccccccccc-3.json', { arm: 'full', ref: 'c'.repeat(40) });
  write('quick-dddddddddddd-4.json', { arm: 'quick', ref: 'd'.repeat(40), valid: false, patch: { path: 'quick-dddddddddddd-4.patch' } });
  write('quick-dddddddddddd-4.patch', '');
  write('baseline-main-2026-11-27.json', { ref: 'main' });
  write('nonconvergent-direct-x.json', { mode: 'direct' });
  return dir;
}

test('collectEntries reads valid arm results only, filters by arm and ref prefix, and finds sibling patches', () => {
  const dir = resultsDir();
  try {
    const all = collectEntries({ resultsDir: dir });
    assert.deepEqual(all.map((e) => [e.key, e.patchPath && e.patchPath.split('/').at(-1)]), [
      ['full-cccccccccccc-3.json', null],
      ['lite-bbbbbbbbbbbb-2.json', 'lite-bbbbbbbbbbbb-2.patch'],
      ['plain-aaaaaaaaaaaa-1.json', 'plain-aaaaaaaaaaaa-1.patch'],
    ]);
    assert.deepEqual(collectEntries({ resultsDir: dir, arm: 'lite' }).map((e) => e.key), ['lite-bbbbbbbbbbbb-2.json']);
    assert.deepEqual(collectEntries({ resultsDir: dir, ref: 'aaaa' }).map((e) => e.key), ['plain-aaaaaaaaaaaa-1.json']);
    assert.deepEqual(collectEntries({ files: [join(dir, 'full-cccccccccccc-3.json')] }).map((e) => e.key), ['full-cccccccccccc-3.json']);

    const dry = dryRunReport(all);
    assert.equal(dry.with_patch, 2);
    assert.equal(dry.message, '2 of 3 result files would be judged');
    assert.equal(dry.rows.find((r) => r.arm === 'full').patch, null);
    assert.deepEqual(dry.rows.find((r) => r.arm === 'plain').kept_files, ['src/pagination.mjs', 'tests/pagination.test.mjs']);
  } finally {
    cleanupTempDir(dir);
  }
});

test('judgeEntries judges each patch twice, blind, in a seeded shuffled order, and records both trials', () => {
  const dir = resultsDir();
  try {
    const prompts = [];
    const canned = [reply([8, 7, 6, 9, 10], 8), reply([6, 7, 6, 9, 10], 6), 'not json', reply([5, 5, 5, 5, 5], 5)];
    const runner = (prompt) => {
      prompts.push(prompt);
      return { text: canned[prompts.length - 1], exit_code: 0, cost_usd: 0.01 };
    };
    const doc = judgeEntries({
      entries: collectEntries({ resultsDir: dir }),
      rubric: '# Rubric\nscore it',
      spec: '# Library Spec: Catalog listing\nBEH-1 ...',
      runner,
      seed: 3,
      model: null,
    });
    assert.equal(prompts.length, 4);
    for (const p of prompts) {
      assert.match(p, /^# Rubric/);
      assert.match(p, /# Library Spec: Catalog listing/);
      assert.match(p, /```diff\ndiff --git a\/src\/pagination\.mjs/);
      assert.doesNotMatch(p, /adev|\.context-index|Plan-task|--lite|plain|lite-|full-/i);
    }
    assert.deepEqual(Object.keys(doc.results).sort(), ['lite-bbbbbbbbbbbb-2.json', 'plain-aaaaaaaaaaaa-1.json']);
    assert.deepEqual(doc.order, shuffled(
      [
        { key: 'lite-bbbbbbbbbbbb-2.json', trial: 1 },
        { key: 'lite-bbbbbbbbbbbb-2.json', trial: 2 },
        { key: 'plain-aaaaaaaaaaaa-1.json', trial: 1 },
        { key: 'plain-aaaaaaaaaaaa-1.json', trial: 2 },
      ],
      3,
    ));
    assert.equal(doc.seed, 3);
    assert.equal(doc.trials_per_patch, 2);
    assert.equal(doc.model, 'session default');
    for (const r of Object.values(doc.results)) {
      assert.deepEqual(r.trials.map((t) => t.trial), [1, 2]);
      assert.deepEqual(r.dropped_files, ['.context-index/lifecycle-state/example.jsonl', 'CLAUDE.md', '.ev1-edge-probes/beh1-pagination.edge.mjs']);
    }
    const positions = Object.values(doc.results).flatMap((r) => r.trials.map((t) => t.position)).sort();
    assert.deepEqual(positions, [0, 1, 2, 3]);
    const failed = Object.values(doc.results).flatMap((r) => r.trials).find((t) => !t.ok);
    assert.equal(failed.raw, 'not json');
    assert.equal(failed.position, 2);

    const byArm = judgeOverallByArm(doc);
    assert.deepEqual(Object.keys(byArm).sort(), ['lite', 'plain']);
    const summary = summarizeJudge(doc);
    assert.equal(summary.plain.patches, 1);
    const table = renderSummary(summary);
    assert.match(table, /^\| arm \| patches\/scored \| spec_compliance \|/);
    assert.match(table, /^\| lite \| 1\/1 \|/m);
  } finally {
    cleanupTempDir(dir);
  }
});

test('judgeEntries is deterministic in its order for one seed', () => {
  const dir = resultsDir();
  try {
    const run = () => judgeEntries({
      entries: collectEntries({ resultsDir: dir }),
      rubric: 'r',
      spec: 's',
      runner: () => ({ text: reply([1, 1, 1, 1, 1], 1) }),
      seed: 11,
    }).order;
    assert.deepEqual(run(), run());
  } finally {
    cleanupTempDir(dir);
  }
});

test('judgeArgv carries the plain arm\'s isolation, no tools, no slash commands and no persistence', () => {
  const argv = judgeArgv({ model: 'opus' });
  assert.ok(!argv.includes('--plugin-dir'));
  assert.equal(argv[argv.indexOf('--tools') + 1], '');
  assert.ok(argv.includes('--disable-slash-commands'));
  assert.ok(argv.includes('--no-session-persistence'));
  assert.equal(argv[argv.indexOf('--output-format') + 1], 'json');
  assert.equal(argv[argv.indexOf('--model') + 1], 'opus');
  const settings = JSON.parse(argv[argv.indexOf('--settings') + 1]);
  assert.equal(settings.enabledPlugins['adev@agentic-development'], false);
  assert.ok(!judgeArgv().includes('--model'));
});

// Pinned to the quick/lite runs recorded at e25a69b7, before patches were persisted, so the
// assertion holds as later runs with patches are committed beside them.
test('judge-runs --dry-run on committed results recorded before patches says cleanly that nothing has a patch, and writes nothing', () => {
  const before = readdirSync(COMMITTED_RESULTS).sort();
  const r = spawnSync('node', [JUDGE, '--dry-run', '--ref', 'e25a69b72eab'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.with_patch, 0);
  assert.ok(out.results > 0);
  assert.equal(out.message, `none of the ${out.results} result files has a patch; nothing to judge`);
  assert.deepEqual(readdirSync(COMMITTED_RESULTS).sort(), before);
});

test('judge-runs without patches refuses to call the model, and --summary reads the latest judge file', () => {
  const dir = createTempDir();
  try {
    writeFileSync(join(dir, 'full-cccccccccccc-3.json'), JSON.stringify({ arm: 'full' }));
    const r = spawnSync('node', [JUDGE, '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NO_PATCHES/);
    assert.equal(latestJudgeFile(dir), null);
    const doc = {
      model: 'm',
      trials_per_patch: 2,
      seed: 1,
      results: { 'plain-a.json': { arm: 'plain', ok_trials: 2, mean: { ...Object.fromEntries(DIMENSIONS.map((d) => [d, 6])), overall: 6.5 }, spread: { overall: 1 } } },
    };
    writeFileSync(join(dir, 'judge-2026-11-27T00-00-00-000Z.json'), JSON.stringify(doc));
    writeFileSync(join(dir, 'judge-2026-11-28T00-00-00-000Z.json'), JSON.stringify({ ...doc, model: 'newer' }));
    const s = spawnSync('node', [JUDGE, '--summary', '--results-dir', dir], { encoding: 'utf8' });
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /model: newer/);
    assert.match(s.stdout, /^\| plain \| 1\/1 \| 6\.00 \| 6\.00 \| 6\.00 \| 6\.00 \| 6\.00 \| 6\.50 \| 1\.00 \|$/m);
    assert.match(readFileSync(latestJudgeFile(dir), 'utf8'), /newer/);
  } finally {
    cleanupTempDir(dir);
  }
});

test('a ref-scoped compare reads the newest judge file that scored that ref, and only its patches', () => {
  const dir = createTempDir();
  try {
    const score = (arm, ref, overall) => ({ arm, ref, ok_trials: 2, mean: { overall }, spread: { overall: 0 } });
    const older = { results: { 'full-a.patch': score('full', 'a'.repeat(40), 9), 'lite-a.patch': score('lite', 'a'.repeat(40), 8) } };
    const newer = { results: { 'lite-b.patch': score('lite', 'b'.repeat(40), 7) } };
    writeFileSync(join(dir, 'judge-2026-11-27T00-00-00-000Z.json'), JSON.stringify(older));
    writeFileSync(join(dir, 'judge-2026-11-28T00-00-00-000Z.json'), JSON.stringify(newer));
    const file = latestJudgeFile(dir, { ref: 'a'.repeat(40) });
    assert.match(file, /2026-11-27/);
    assert.deepEqual(judgeOverallByArm(JSON.parse(readFileSync(file, 'utf8')), { ref: 'a'.repeat(40) }), {
      full: { overall: 9, patches: 1 },
      lite: { overall: 8, patches: 1 },
    });
    assert.deepEqual(judgeOverallByArm(newer, { ref: 'a'.repeat(40) }), {});
    assert.equal(latestJudgeFile(dir, { ref: 'c'.repeat(40) }), null);
    assert.match(latestJudgeFile(dir), /2026-11-28/);
  } finally {
    cleanupTempDir(dir);
  }
});
