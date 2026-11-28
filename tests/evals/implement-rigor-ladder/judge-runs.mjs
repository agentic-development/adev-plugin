#!/usr/bin/env node
// [live] Blind LLM rubric judge for EV-1 run patches.
//
// Input: EV-1 result JSON files (positional paths), or every arm result in
// `--results-dir` (default results/), narrowed by `--arm <id>` and
// `--ref <sha-prefix>`. Each result's `<result>.patch` (written by
// run-ab-eval.mjs) is anonymized: diff sections for adev bookkeeping
// (.context-index/, probe dirs, .beads/, .adev/, .claude/, lifecycle-state/,
// CLAUDE.md, AGENTS.md) are dropped, and `Spec:`/`Plan-task:` text, adev
// names, `.context-index/` paths and the arm flags are redacted, so the judge
// cannot infer the arm. The judge sees judge-rubric.md, fixture/example.spec.md
// and that patch, nothing else.
//
// Each patch is judged `--trials` times (default 2) by independent
// `claude -p --output-format json` calls, in an order shuffled by `--seed`.
// The calls carry the plain arm's isolation (no plugin, adev disabled by
// --settings, no ADEV_* env), no tools, no slash commands, no session
// persistence, and run in an empty temp dir. `--model` defaults to the
// session default. The output is `results/judge-<iso>.json` (or `--out`),
// keyed by result file name, with both trials, their mean and their spread.
//
// `--dry-run` prints what would be judged and each anonymized patch's size,
// with no model call. `--summary [judge-file]` prints per-arm means from the
// given judge file or the latest one in `--results-dir`.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARMS, EV1_FIXTURE, HarnessError, installedAdevPluginIds, isolationSettings, plainTrialEnv } from './run-ab-eval.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RESULTS_DIR = join(HERE, 'results');
const RUBRIC = join(HERE, 'judge-rubric.md');
const JUDGE_FILE = /^judge-.+\.json$/;
const ARM_RESULT_FILE = new RegExp(`^(${ARMS.map((a) => a.id).join('|')})-.+\\.json$`);
const JUDGE_TIMEOUT_MS = 10 * 60 * 1000;

export const DIMENSIONS = ['spec_compliance', 'correctness_robustness', 'test_quality', 'code_clarity', 'scope_discipline'];

const BOOKKEEPING_PATHS = [
  /^\.context-index\//,
  /^\.ev1-(?:edge-)?probes\//,
  /^\.beads\//,
  /^\.adev\//,
  /^\.claude\//,
  /(?:^|\/)lifecycle-state\//,
  /(?:^|\/)(?:CLAUDE|AGENTS)\.md$/,
];

const REDACTIONS = [
  [/\b(?:Spec|Plan-task|Author-type|Operator):[^\n]*/g, '[redacted]'],
  [/\.context-index\/[^\s'"`)]*/g, '[redacted-path]'],
  [/\/?\badev\b(?::[\w-]+)?/gi, '[redacted]'],
  [/--lite\b|--tier(?:[ =]\w+)?/g, '[redacted]'],
];

/** The sections of a `git diff`, one per file, each with its b/ path. */
export function splitPatch(text) {
  const sections = [];
  const starts = [...String(text ?? '').matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
    sections.push({ path: m[2], text: text.slice(m.index, end) });
  });
  return sections;
}

/**
 * The patch with bookkeeping sections dropped and arm-identifying text
 * redacted in place, so hunk line counts stay as they were.
 */
export function anonymizePatch(text) {
  const kept = [];
  const dropped = [];
  let body = '';
  for (const s of splitPatch(text)) {
    if (BOOKKEEPING_PATHS.some((re) => re.test(s.path))) {
      dropped.push(s.path);
      continue;
    }
    kept.push(s.path);
    body += s.text;
  }
  let redactions = 0;
  for (const [re, sub] of REDACTIONS) {
    body = body.replace(re, () => {
      redactions++;
      return sub;
    });
  }
  return { text: body, kept, dropped, redactions, bytes: Buffer.byteLength(body) };
}

export function judgePrompt({ rubric, spec, patch }) {
  return [
    rubric.trim(),
    '',
    '## The spec',
    '',
    spec.trim(),
    '',
    '## The patch',
    '',
    '```diff',
    patch.trimEnd(),
    '```',
    '',
    'Reply with the JSON object only.',
  ].join('\n');
}

function extractJson(text) {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const validScore = (s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 10;

/**
 * Parses one judge reply. Every dimension needs a 0..10 score and at least
 * one evidence string; overall needs a 0..10 score. Anything else is an
 * error, recorded rather than guessed at.
 */
export function parseJudgeOutput(text) {
  const doc = extractJson(String(text ?? ''));
  if (!doc || typeof doc !== 'object') return { ok: false, error: 'no JSON object in the reply' };
  const scores = {};
  const errors = [];
  for (const dim of DIMENSIONS) {
    const d = doc.dimensions?.[dim];
    const evidence = typeof d?.evidence === 'string' ? [d.evidence] : d?.evidence;
    if (!validScore(d?.score)) errors.push(`${dim}: score missing or outside 0..10`);
    else if (!Array.isArray(evidence) || !evidence.some((e) => typeof e === 'string' && e.trim())) errors.push(`${dim}: no evidence`);
    else scores[dim] = { score: d.score, evidence: evidence.filter((e) => typeof e === 'string' && e.trim()) };
  }
  if (!validScore(doc.overall?.score)) errors.push('overall: score missing or outside 0..10');
  if (errors.length) return { ok: false, error: errors.join('; ') };
  return { ok: true, scores, overall: { score: doc.overall.score, rationale: String(doc.overall.rationale ?? '') } };
}

const round2 = (x) => Math.round(x * 100) / 100;
const mean = (xs) => (xs.length === 0 ? null : round2(xs.reduce((a, b) => a + b, 0) / xs.length));

/** Mean and spread (max - min) per dimension and overall, over the trials that parsed. */
export function summarizeTrials(trials) {
  const ok = trials.filter((t) => t.ok);
  const keys = [...DIMENSIONS, 'overall'];
  const valueOf = (t, k) => (k === 'overall' ? t.overall.score : t.scores[k].score);
  const meanOut = {};
  const spread = {};
  for (const k of keys) {
    const xs = ok.map((t) => valueOf(t, k));
    meanOut[k] = mean(xs);
    spread[k] = xs.length < 2 ? null : Math.max(...xs) - Math.min(...xs);
  }
  return { ok_trials: ok.length, mean: meanOut, spread };
}

// mulberry32: a seeded order is reproducible from the seed in the output.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(items, seed) {
  const out = [...items];
  const rand = prng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function resolvePatchPath(resultFile, result) {
  const dir = dirname(resultFile);
  const named = typeof result?.patch?.path === 'string' ? join(dir, result.patch.path) : null;
  if (named && existsSync(named)) return named;
  const sibling = join(dir, `${basename(resultFile, '.json')}.patch`);
  return existsSync(sibling) ? sibling : null;
}

/**
 * The result files to judge: the given paths, or every arm result in
 * `resultsDir` matching the arm and ref-prefix filters.
 */
export function collectEntries({ files = [], resultsDir = DEFAULT_RESULTS_DIR, arm = null, ref = null } = {}) {
  const paths = files.length > 0
    ? files.map((f) => resolve(f))
    : existsSync(resultsDir)
      ? readdirSync(resultsDir).filter((f) => ARM_RESULT_FILE.test(f)).sort().map((f) => join(resultsDir, f))
      : [];
  const entries = [];
  for (const file of paths) {
    let result;
    try {
      result = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new HarnessError('RESULT_UNREADABLE', `${file}: ${err.message}`);
    }
    if (typeof result?.arm !== 'string') continue;
    if (arm && result.arm !== arm) continue;
    if (ref && !String(result.ref ?? '').startsWith(ref)) continue;
    // An invalid run (e.g. cut off by a usage limit) leaves an empty or partial patch; scoring it
    // would rate the interruption, not the arm.
    if (result.valid === false) continue;
    const patchPath = resolvePatchPath(file, result);
    entries.push({ file, key: basename(file), result, patchPath });
  }
  return entries;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export function dryRunReport(entries) {
  const rows = entries.map((e) => {
    if (!e.patchPath) return { file: e.key, arm: e.result.arm, patch: null, note: 'no patch (recorded before patches were persisted)' };
    const anon = anonymizePatch(readFileSync(e.patchPath, 'utf8'));
    return {
      file: e.key,
      arm: e.result.arm,
      patch: basename(e.patchPath),
      anonymized_bytes: anon.bytes,
      kept_files: anon.kept,
      dropped_files: anon.dropped,
      redactions: anon.redactions,
    };
  });
  const judgeable = rows.filter((r) => r.patch).length;
  return {
    results: rows.length,
    with_patch: judgeable,
    message: judgeable === 0
      ? `none of the ${rows.length} result files has a patch; nothing to judge`
      : `${judgeable} of ${rows.length} result files would be judged`,
    rows,
  };
}

/**
 * Judges every entry that has a patch, `trials` times each, in an order
 * shuffled by `seed`. `runner(prompt)` returns `{ text, exit_code, cost_usd }`.
 */
export function judgeEntries({ entries, rubric, spec, runner, seed, trials = 2, model = null }) {
  const judgeable = entries.filter((e) => e.patchPath);
  const prompts = new Map();
  const meta = {};
  for (const e of judgeable) {
    const raw = readFileSync(e.patchPath, 'utf8');
    const anon = anonymizePatch(raw);
    prompts.set(e.key, judgePrompt({ rubric, spec, patch: anon.text }));
    meta[e.key] = {
      arm: e.result.arm,
      ref: e.result.ref ?? null,
      patch: basename(e.patchPath),
      patch_bytes: Buffer.byteLength(raw),
      anonymized_bytes: anon.bytes,
      dropped_files: anon.dropped,
      trials: [],
    };
  }
  const jobs = shuffled(judgeable.flatMap((e) => Array.from({ length: trials }, (_, i) => ({ key: e.key, trial: i + 1 }))), seed);
  jobs.forEach((job, position) => {
    const reply = runner(prompts.get(job.key));
    const parsed = parseJudgeOutput(reply.text);
    meta[job.key].trials.push({
      trial: job.trial,
      position,
      exit_code: reply.exit_code ?? null,
      cost_usd: reply.cost_usd ?? null,
      ...parsed,
      ...(parsed.ok ? {} : { raw: String(reply.text ?? '').slice(0, 4000) }),
    });
  });
  for (const m of Object.values(meta)) {
    m.trials.sort((a, b) => a.trial - b.trial);
    Object.assign(m, summarizeTrials(m.trials));
  }
  return {
    judged_at: new Date().toISOString(),
    model: model ?? 'session default',
    seed,
    trials_per_patch: trials,
    rubric: basename(RUBRIC),
    rubric_sha256: sha256(rubric),
    spec_sha256: sha256(spec),
    order: jobs,
    results: meta,
  };
}

/**
 * Per-arm mean of each patch's mean overall score, for run-ab-eval --compare. With `ref`, only patches
 * recorded at that commit count: one judge file can hold runs from several refs, and an arm's score
 * must describe the runs the compare table shows.
 */
export function judgeOverallByArm(doc, { ref = null } = {}) {
  const byArm = {};
  for (const r of Object.values(doc?.results ?? {})) {
    if (typeof r?.mean?.overall !== 'number') continue;
    if (ref !== null && r.ref !== ref) continue;
    (byArm[r.arm] ??= []).push(r.mean.overall);
  }
  return Object.fromEntries(Object.entries(byArm).map(([arm, xs]) => [arm, { overall: mean(xs), patches: xs.length }]));
}

export function summarizeJudge(doc) {
  const byArm = {};
  for (const r of Object.values(doc?.results ?? {})) (byArm[r.arm] ??= []).push(r);
  const out = {};
  for (const arm of ARMS.map((a) => a.id)) {
    const rows = byArm[arm];
    if (!rows) continue;
    const scored = rows.filter((r) => r.ok_trials > 0);
    const row = { patches: rows.length, scored: scored.length };
    for (const k of [...DIMENSIONS, 'overall']) {
      row[k] = mean(scored.map((r) => r.mean[k]).filter((x) => typeof x === 'number'));
    }
    row.mean_overall_spread = mean(scored.map((r) => r.spread.overall).filter((x) => typeof x === 'number'));
    out[arm] = row;
  }
  return out;
}

export function renderSummary(summary) {
  const cols = ['arm', 'patches/scored', ...DIMENSIONS, 'overall', 'overall spread'];
  const lines = [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`];
  const f = (x) => (x === null || x === undefined ? 'n/a' : x.toFixed(2));
  for (const [arm, r] of Object.entries(summary)) {
    lines.push(`| ${[arm, `${r.patches}/${r.scored}`, ...DIMENSIONS.map((d) => f(r[d])), f(r.overall), f(r.mean_overall_spread)].join(' | ')} |`);
  }
  return lines.join('\n');
}

/** The newest judge file, or with `ref` the newest one that scored a patch recorded at that commit. */
export function latestJudgeFile(resultsDir, { ref = null } = {}) {
  if (!existsSync(resultsDir)) return null;
  const files = readdirSync(resultsDir).filter((f) => JUDGE_FILE.test(f)).sort().reverse();
  for (const f of files) {
    const path = join(resultsDir, f);
    if (ref === null) return path;
    let doc;
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    if (Object.values(doc?.results ?? {}).some((r) => r?.ref === ref)) return path;
  }
  return null;
}

/** The judge's claude argv: the plain arm's plugin isolation, no tools, no skills, nothing persisted. */
export function judgeArgv({ model = null, settings = isolationSettings(installedAdevPluginIds()) } = {}) {
  return [
    '--print',
    '--output-format', 'json',
    '--no-session-persistence',
    '--tools', '',
    '--disable-slash-commands',
    '--settings', JSON.stringify(settings),
    ...(model ? ['--model', model] : []),
  ];
}

// The prompt goes on stdin: a patch can exceed what a wrapper or the OS
// accepts as one argument.
function claudeRunner({ model }) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'adev-ev1-judge-')));
  const argv = judgeArgv({ model });
  const env = plainTrialEnv({ plainBin: null, cwd });
  const run = (prompt) => {
    const r = spawnSync('claude', argv, {
      cwd, env, input: prompt, encoding: 'utf8', timeout: JUDGE_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024,
    });
    let parsed = null;
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      parsed = null;
    }
    return {
      text: typeof parsed?.result === 'string' ? parsed.result : String(r.stdout ?? ''),
      exit_code: r.status,
      cost_usd: parsed?.total_cost_usd ?? null,
    };
  };
  return { run, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function parseArgs(argv) {
  const opts = {
    files: [], resultsDir: DEFAULT_RESULTS_DIR, arm: null, ref: null, model: null, seed: null, trials: 2,
    out: null, dryRun: false, summary: false, summaryFile: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--summary') {
      opts.summary = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.summaryFile = resolve(argv[++i]);
    } else if (a === '--results-dir') opts.resultsDir = resolve(argv[++i] ?? '');
    else if (a === '--arm') opts.arm = argv[++i];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (a === '--trials') opts.trials = Number(argv[++i]);
    else if (a === '--out') opts.out = resolve(argv[++i] ?? '');
    else if (a.startsWith('--')) throw new HarnessError('USAGE', `unknown argument '${a}'`);
    else opts.files.push(a);
  }
  if (opts.arm !== null && !ARMS.some((x) => x.id === opts.arm)) {
    throw new HarnessError('USAGE', `--arm must be one of ${ARMS.map((x) => x.id).join('|')}`);
  }
  if (!Number.isInteger(opts.trials) || opts.trials < 1) throw new HarnessError('USAGE', '--trials must be an integer >= 1');
  if (opts.seed !== null && !Number.isInteger(opts.seed)) throw new HarnessError('USAGE', '--seed must be an integer');
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.summary) {
    const file = opts.summaryFile ?? latestJudgeFile(opts.resultsDir);
    if (!file) throw new HarnessError('NO_JUDGE_FILE', `no judge-*.json in ${opts.resultsDir}`);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`judge file: ${file}\nmodel: ${doc.model}, trials per patch: ${doc.trials_per_patch}, seed: ${doc.seed}\n`);
    console.log(renderSummary(summarizeJudge(doc)));
    return 0;
  }
  const entries = collectEntries(opts);
  if (opts.dryRun) {
    console.log(JSON.stringify(dryRunReport(entries), null, 2));
    return 0;
  }
  if (!entries.some((e) => e.patchPath)) {
    throw new HarnessError('NO_PATCHES', `none of the ${entries.length} selected result files has a patch`);
  }
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const runner = claudeRunner({ model: opts.model });
  let doc;
  try {
    doc = judgeEntries({
      entries,
      rubric: readFileSync(RUBRIC, 'utf8'),
      spec: readFileSync(EV1_FIXTURE.specPath, 'utf8'),
      runner: runner.run,
      seed,
      trials: opts.trials,
      model: opts.model,
    });
  } finally {
    runner.cleanup();
  }
  const out = opts.out ?? join(opts.resultsDir, `judge-${doc.judged_at.replace(/[:.]/g, '-')}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${out}\n`);
  console.log(renderSummary(summarizeJudge(doc)));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`judge-runs: ${err.message}\n`);
      process.exitCode = 1;
    },
  );
}
