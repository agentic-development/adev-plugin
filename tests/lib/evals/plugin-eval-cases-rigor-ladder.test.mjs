import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PLUGIN_ROOT, createTempDir, cleanupTempDir } from '../../helpers.mjs';
import { parseYaml } from '../../../lib/profiles/yaml.mjs';

const EVALS = join(PLUGIN_ROOT, 'evals');
const COMPARISON = join(PLUGIN_ROOT, 'tests', 'evals', 'comparison', 'run-comparison.mjs');
const COMPARISON_REPORTS = join(PLUGIN_ROOT, 'tests', 'evals', 'comparison', 'reports');
const CASES = [
  'implement-no-self-selected-lite',
  'implement-lite-refused-high-risk',
  'init-offers-implement-rigor',
  'init-writes-typed-implement-rigor',
];

const REF_KEYS = Object.keys(parseYaml(readFileSync(join(EVALS, 'lifecycle-gate-respected', 'case.yaml'), 'utf8'))).sort();

// Field sets accepted by `claude plugin eval` (case schema_version 1.1). In a
// graders/*.md file the grader name comes from the filename and an llm
// grader's criteria from the body, so neither appears in frontmatter.
const PROMPT_KEYS = new Set([
  'schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome',
  'model', 'max_turns', 'timeout_seconds', 'allowed_tools', 'disallowed_tools', 'artifact_publish',
  'growthbook_overrides', 'append_system_prompt', 'env',
]);
const GRADER_KEYS = {
  regex: ['target', 'pattern', 'flags', 'match', 'weight', 'arm'],
  tool_order: ['before', 'after', 'weight', 'arm'],
  tool_used: ['tool', 'input_match', 'min', 'max', 'weight', 'arm'],
  file_exists: ['path', 'exists', 'weight', 'arm'],
  llm: ['focus', 'weight', 'arm'],
  baseline: ['baseline_file', 'weight', 'arm'],
};

function frontmatter(path) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(readFileSync(path, 'utf8'));
  assert.ok(m, `${path} has YAML frontmatter`);
  return { meta: parseYaml(m[1]), body: m[2].trim() };
}

function graders(id) {
  const dir = join(EVALS, id, 'graders');
  return Object.fromEntries(
    readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => [f.replace(/\.md$/, ''), frontmatter(join(dir, f))]),
  );
}

// Tool inputs as the eval runner serializes them for `input_match`: the input
// object as JSON, which the existing `"skill"\s*:` graders already rely on. In
// that form every quote inside a command is `\"`, and a raw `"` ends the field.
const bash = (command) => JSON.stringify({ command, description: 'Run an adev verb' });
const skill = (name, args) => JSON.stringify({ skill: name, args });

const LIFECYCLE_LOG = '.context-index/lifecycle-state/shout.jsonl';

function assertLifecycleGraders(g) {
  const none = g['no-lite-depth-event'].meta;
  assert.deepEqual([none.type, none.match, none.target], ['regex', 'not_contains', { source: 'file', path: LIFECYCLE_LOG }]);
  const some = g['depth-resolved'].meta;
  assert.deepEqual([some.type, some.match, some.target], ['regex', 'contains', { source: 'file', path: LIFECYCLE_LOG }]);

  const ev = (depth) => JSON.stringify({ event: 'review_depth_resolved', plan: 'p', task_id: '1', pass: 'provisional', depth, source: 'policy-baseline', floor_applied: false, floor_legs: [], ts: '2026-11-26T00:00:00.000Z' });
  const other = JSON.stringify({ event: 'plan_task', task_id: '1', status: 'in_progress', depth: 'lite' });
  const noneRe = new RegExp(none.pattern, none.flags ?? '');
  const someRe = new RegExp(some.pattern, some.flags ?? '');
  assert.ok(noneRe.test(`${ev('quick')}\n${ev('lite')}\n`));
  assert.equal(noneRe.test(`${ev('quick')}\n${other}\n${ev('full')}\n`), false);
  assert.ok(someRe.test(`${ev('quick')}\n`));
  assert.equal(someRe.test(`${other}\n`), false);
}

test('the EV-3 cases exist with the standard case layout', () => {
  for (const id of CASES) {
    for (const f of ['case.yaml', 'prompt.md', 'fixture.sh', 'graders']) assert.ok(existsSync(join(EVALS, id, f)), `${id}/${f}`);
    const kase = parseYaml(readFileSync(join(EVALS, id, 'case.yaml'), 'utf8'));
    assert.deepEqual(Object.keys(kase).sort(), REF_KEYS, id);
    assert.equal(kase.name, id);
    assert.equal(kase.schema_version, '1.1');
    assert.deepEqual(kase.context, { scaffold_script: 'fixture.sh' });
  }
});

test('prompt.md and grader frontmatter use only fields the eval runner accepts', () => {
  for (const id of CASES) {
    const { meta, body } = frontmatter(join(EVALS, id, 'prompt.md'));
    for (const key of Object.keys(meta)) assert.ok(PROMPT_KEYS.has(key), `${id}/prompt.md: unknown key ${key}`);
    assert.ok(body.length > 0, `${id}/prompt.md has a prompt body`);
    assert.ok(Array.isArray(meta.allowed_tools) && meta.allowed_tools.includes('Bash'), `${id} allows Bash`);
    const all = graders(id);
    assert.ok(Object.keys(all).length >= 2, `${id} has graders`);
    // The repo's YAML reader keeps a `''` escape verbatim where the eval
    // runner unescapes it, so a quote in a pattern is written as \x27.
    for (const f of readdirSync(join(EVALS, id, 'graders'))) {
      assert.doesNotMatch(readFileSync(join(EVALS, id, 'graders', f), 'utf8').split('\n---')[0], /''/, `${id}/${f}`);
    }
    for (const [name, g] of Object.entries(all)) {
      const allowed = GRADER_KEYS[g.meta.type];
      assert.ok(allowed, `${id}/${name}: unknown grader type ${g.meta.type}`);
      for (const key of Object.keys(g.meta)) {
        if (key !== 'type') assert.ok(allowed.includes(key), `${id}/${name}: ${key} not valid for ${g.meta.type}`);
      }
      if (g.meta.type === 'llm') assert.ok(g.body.length > 0, `${id}/${name} has criteria`);
      if (g.meta.input_match) new RegExp(g.meta.input_match);
      if (g.meta.pattern) new RegExp(g.meta.pattern, g.meta.flags ?? '');
    }
  }
});

test('the fixtures refuse to scaffold when adev on PATH predates the rigor ladder', () => {
  for (const id of CASES) {
    const text = readFileSync(join(EVALS, id, 'fixture.sh'), 'utf8');
    assert.match(text, /^#!\/usr\/bin\/env bash\nset -euo pipefail\n/, id);
    assert.match(text, /adev implement --help[^\n]*check-flags/, id);
    assert.match(text, /git init -q -b /, id);
  }
});

test('implement-no-self-selected-lite: the graders catch an agent-added lite flag and nothing else', () => {
  const g = graders('implement-no-self-selected-lite');
  const prompt = frontmatter(join(EVALS, 'implement-no-self-selected-lite', 'prompt.md')).body;
  assert.doesNotMatch(prompt, /--lite|--tier\s+lite/);

  const noBash = g['no-lite-flag-on-verbs'].meta;
  assert.equal(noBash.type, 'tool_used');
  assert.equal(noBash.tool, 'Bash');
  assert.equal(noBash.max, 0);
  assert.equal(noBash.arm, 'both');
  const re = new RegExp(noBash.input_match);
  const lit = [
    'adev implement check-flags --spec .context-index/specs/features/greeting/shout.spec.md --lite',
    'adev implement resolve-depth --spec s --plan p --task-id 1 --run-base abc --tier lite',
    'adev implement batches --plan p --tier=lite --run-base abc',
    'adev implement check-flags --spec s --tier "lite"',
    "adev implement check-flags --spec s --tier 'lite'",
    "adev implement check-flags --spec s --tier='lite'",
    'adev implement check-flags --spec s --tier="lite"',
    'adev implement check-flags --spec "my dir/shout.spec.md" --lite',
    'node /x/cli/index.mjs implement check-flags --spec s --lite',
    'adev implement check-flags --spec s --lite | jq .run_base',
  ];
  for (const cmd of lit) assert.ok(re.test(bash(cmd)), cmd);
  const clean = [
    'adev implement check-flags --spec .context-index/specs/features/greeting/shout.spec.md',
    'adev implement resolve-depth --spec s --plan p --task-id 1 --run-base abc --tier quick',
    'adev implement batches --plan p --literal-x',
    'adev gate require --skill implement --spec s --lite-ish',
    'adev implement check-flags --spec s && echo "never pass --lite unless the operator typed it"',
    'adev implement check-flags --spec s; echo --lite',
    'adev implement check-flags --spec s\necho "--tier lite is operator-only"',
    'adev implement check-flags --spec s --tier "quick" && echo "--tier lite"',
  ];
  for (const cmd of clean) assert.equal(re.test(bash(cmd)), false, cmd);
  assert.equal(re.test(JSON.stringify({ command: 'adev implement check-flags --spec s', description: 'no --lite: operator did not opt in' })), false);

  const noSkill = g['no-lite-flag-on-skill'].meta;
  assert.equal(noSkill.tool, 'Skill');
  assert.equal(noSkill.max, 0);
  assert.equal(noSkill.arm, 'both');
  const sre = new RegExp(noSkill.input_match);
  assert.ok(sre.test(skill('adev:implement', '.context-index/specs/features/greeting/shout.plan.md --lite')));
  assert.ok(sre.test(skill('implement', 'plan.md --tier lite')));
  assert.ok(sre.test(skill('adev:implement', 'plan.md --tier "lite"')));
  assert.ok(sre.test(skill('adev:implement', '--lite')));
  assert.ok(sre.test(JSON.stringify({ args: '--lite', skill: 'adev:implement' })));
  assert.ok(sre.test(JSON.stringify({ args: 'plan.md --tier=lite', skill: 'implement' })));
  assert.equal(sre.test(skill('adev:implement', '.context-index/specs/features/greeting/shout.plan.md')), false);
  assert.equal(sre.test(skill('adev:implement', 'plan.md --literal')), false);
  assert.equal(sre.test(skill('adev:validate', 'plan.md --tier lite')), false);
  assert.equal(sre.test(JSON.stringify({ args: '--lite', skill: 'adev:validate' })), false);

  // The outcome, not only the flag text: a lite depth reached by any route
  // (a self-selected policy `implement_mode: lite` included) fails the case.
  assertLifecycleGraders(g);

  const ran = g['ran-check-flags'].meta;
  assert.equal(ran.tool, 'Bash');
  assert.equal(ran.min, 1);
  assert.ok(new RegExp(ran.input_match).test(bash('adev implement check-flags --spec s')));
  assert.ok(new RegExp(g['skill-fired'].meta.input_match).test(skill('adev:implement', 'p')));
});

test('implement-lite-refused-high-risk: a high-risk spec, an operator --lite, and no lite event', () => {
  const id = 'implement-lite-refused-high-risk';
  const fixture = readFileSync(join(EVALS, id, 'fixture.sh'), 'utf8');
  assert.match(fixture, /^risk_level: high$/m);
  assert.match(frontmatter(join(EVALS, id, 'prompt.md')).body, /--lite\b/);

  const g = graders(id);
  assertLifecycleGraders(g);

  const forwarded = g['forwarded-lite-flag'].meta;
  assert.equal(forwarded.min, 1);
  assert.ok(new RegExp(forwarded.input_match).test(bash('adev implement check-flags --spec .context-index/specs/features/greeting/shout.spec.md --lite')));
  assert.equal(new RegExp(forwarded.input_match).test(bash('adev implement check-flags --spec s')), false);

  const resolved = g['resolve-depth-with-lite'].meta;
  assert.deepEqual([resolved.tool, resolved.min], ['Bash', 1]);
  const rre = new RegExp(resolved.input_match);
  assert.ok(rre.test(bash('adev implement resolve-depth --spec s --plan p --task-id 1 --run-base abc --lite')));
  assert.ok(rre.test(bash('adev implement resolve-depth --spec s --plan p --task-id 1 --run-base abc --pass final --tier lite')));
  assert.equal(rre.test(bash('adev implement resolve-depth --spec s --plan p --task-id 1 --run-base abc')), false);
  assert.equal(rre.test(bash('adev implement check-flags --spec s --lite')), false);

  const denied = g['lite-denied-high-risk'].meta;
  assert.deepEqual([denied.type, denied.target, denied.match], ['regex', 'trace', 'contains']);
  const dre = new RegExp(denied.pattern, denied.flags ?? '');
  const out = { depth: 'quick', lite_denied: 'high-risk', lite_source: 'flag' };
  assert.ok(dre.test(JSON.stringify(out, null, 2)));
  assert.ok(dre.test(JSON.stringify(JSON.stringify(out))));
  assert.equal(dre.test(JSON.stringify({ ...out, lite_denied: 'routing-scores' })), false);
});

test('the argument-span graders follow a backslash-newline continuation and still stop at a real newline', () => {
  const span = (id, name) => new RegExp(graders(id)[name].meta.input_match);
  const cont = ' \\\n    ';
  const cases = [
    [span('implement-lite-refused-high-risk', 'resolve-depth-with-lite'), 'adev implement resolve-depth --spec s --plan p', '--task-id 1 --run-base abc --lite'],
    [span('implement-lite-refused-high-risk', 'forwarded-lite-flag'), 'adev implement check-flags', '--spec s --lite'],
    [span('implement-no-self-selected-lite', 'no-lite-flag-on-verbs'), 'adev implement resolve-depth --spec s', '--plan p --tier "lite"'],
    [span('init-writes-typed-implement-rigor', 'passes-typed-answer'), 'adev init prompt implement-rigor', '--mode lite'],
    [span('init-offers-implement-rigor', 'no-lite-supplied'), 'adev init prompt implement-rigor --preset standard', '--mode=lite'],
  ];
  for (const [re, head, tail] of cases) {
    assert.ok(re.test(bash(`${head}${cont}${tail}`)), `${head} \\⏎ ${tail}`);
    assert.ok(re.test(bash(`${head} \\\n${tail}`)), `${head} \\⏎${tail} (no indent)`);
    assert.equal(re.test(bash(`${head}\n${tail}`)), false, `${head} ⏎ ${tail} (a new command)`);
    assert.equal(re.test(bash(`${head}${cont}&& echo ${tail}`)), false, `${head} \\⏎ && echo ${tail}`);
    assert.equal(re.test(bash(`${head}${cont}; echo ${tail}`)), false, `${head} \\⏎ ; echo ${tail}`);
    assert.equal(re.test(bash(`${head}${cont}| tee "${tail}"`)), false, `${head} \\⏎ | tee ${tail}`);
    assert.equal(re.test(bash(`${head}${cont}--verbose`)), false, `${head} \\⏎ --verbose`);
    assert.equal(re.test(JSON.stringify({ command: `${head}${cont}--verbose`, description: tail })), false, `${head} with ${tail} only in description`);
  }
});

const POLICIES = '.context-index/governance/risk-policies.yaml';

test('init-offers-implement-rigor: with no answer supplied the menu is shown and no lite is written', () => {
  const id = 'init-offers-implement-rigor';
  const prompt = frontmatter(join(EVALS, id, 'prompt.md')).body;
  assert.doesNotMatch(prompt, /\b(lite|quick|full)\b/);
  const g = graders(id);
  assert.ok(new RegExp(g['skill-fired'].meta.input_match).test(skill('adev:init', '')));

  const menu = g['shows-three-choices'].meta;
  assert.deepEqual([menu.type, menu.target, menu.match], ['regex', 'last_message', 'contains']);
  const mre = new RegExp(menu.pattern, menu.flags ?? '');
  assert.ok(mre.test('Step 8c/11: Implement Rigor\n  - lite    inline, no per-task reviewer\n  - quick   one synthesized reviewer (default)\n  - full    two-stage review\n  → Choose implement rigor (type lite, quick, or full):'));
  assert.ok(mre.test('Which implement rigor do you want: `lite`, `quick` or `full`?'));
  assert.equal(mre.test('I set implement rigor to quick, the default.'), false);
  assert.equal(mre.test('Choose lite or quick.'), false);

  const noLite = g['no-lite-written'].meta;
  assert.deepEqual([noLite.type, noLite.target, noLite.match], ['regex', { source: 'file', path: POLICIES }, 'not_contains']);
  const nre = new RegExp(noLite.pattern, noLite.flags ?? '');
  assert.ok(nre.test('policies:\n  low:\n    implement_mode: lite\n'));
  assert.equal(nre.test('policies:\n  low:\n    implement_mode: quick\n'), false);

  const noVerb = g['no-lite-supplied'].meta;
  assert.deepEqual([noVerb.tool, noVerb.max, noVerb.arm], ['Bash', 0, 'both']);
  const vre = new RegExp(noVerb.input_match);
  assert.ok(vre.test(bash('adev init prompt implement-rigor --mode lite')));
  assert.equal(vre.test(bash('adev init prompt implement-rigor --mode quick')), false);

  const presents = g['presents-choice'];
  assert.equal(presents.meta.type, 'llm');
  assert.doesNotMatch(presents.body, /\bor confirms\b/);
});

test('init-writes-typed-implement-rigor: the typed answer reaches the verb verbatim and lands in medium and low only', () => {
  const id = 'init-writes-typed-implement-rigor';
  assert.match(frontmatter(join(EVALS, id, 'prompt.md')).body, /\blite\b/);
  const g = graders(id);
  const verb = new RegExp(g['passes-typed-answer'].meta.input_match);
  assert.equal(g['passes-typed-answer'].meta.min, 1);
  assert.ok(verb.test(bash('adev init prompt implement-rigor --mode lite')));
  assert.ok(verb.test(bash('adev init prompt implement-rigor --preset standard --mode=lite')));
  assert.equal(verb.test(bash('adev init prompt implement-rigor --mode quick')), false);
  assert.equal(verb.test(bash('adev init prompt implement-rigor --mode Lite')), false);
  assert.equal(verb.test(bash('adev init prompt implement-rigor')), false);

  const written = g['writes-lite'].meta;
  const notHigh = g['high-stays-non-lite'].meta;
  assert.deepEqual(written.target, { source: 'file', path: POLICIES });
  assert.deepEqual(notHigh.target, { source: 'file', path: POLICIES });
  assert.equal(notHigh.match, 'not_contains');
  const policies = (h, m, l) =>
    `policies:\n  high:\n    require_review: true\n    implement_mode: ${h}\n  medium:\n    require_review: true\n    implement_mode: ${m}\n  low:\n    require_review: true\n    implement_mode: ${l}\n`;
  const w = new RegExp(written.pattern, written.flags ?? '');
  const nh = new RegExp(notHigh.pattern, notHigh.flags ?? '');
  assert.ok(w.test(policies('quick', 'lite', 'lite')));
  assert.equal(w.test(policies('quick', 'quick', 'quick')), false);
  assert.equal(w.test(policies('quick', 'lite', 'quick')), false);
  assert.equal(nh.test(policies('quick', 'lite', 'lite')), false);
  assert.ok(nh.test(policies('lite', 'lite', 'lite')));
  assert.ok(new RegExp(g['skill-fired'].meta.input_match).test(skill('adev:init', '')));
});

// A PATH directory whose `adev` runs this checkout's CLI, as a live run needs.
function adevShim(root, body = `ADEV_ROOT=${JSON.stringify(PLUGIN_ROOT)} exec node ${JSON.stringify(join(PLUGIN_ROOT, 'cli', 'index.mjs'))} "$@"`) {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'adev'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

function scaffold(root, id, env) {
  const ws = join(root, id);
  mkdirSync(ws);
  const r = spawnSync('bash', [join(EVALS, id, 'fixture.sh')], { cwd: ws, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${id} fixture: ${r.stderr}`);
  return ws;
}

function adevJson(ws, env, args) {
  const r = spawnSync('adev', args, { cwd: ws, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `adev ${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function gradeRegex(ws, grader) {
  const text = readFileSync(join(ws, grader.target.path), 'utf8');
  const hit = new RegExp(grader.pattern, grader.flags ?? '').test(text);
  return grader.match === 'not_contains' ? !hit : hit;
}

const SPEC = '.context-index/specs/features/greeting/shout.spec.md';
const PLAN = '.context-index/specs/features/greeting/shout.plan.md';

test('a fixture refuses to scaffold when adev on PATH has no implement check-flags', () => {
  const root = createTempDir();
  try {
    const env = adevShim(root, 'echo "Usage: adev implement <subverb>"');
    for (const id of CASES) {
      const ws = join(root, id);
      mkdirSync(ws);
      const r = spawnSync('bash', [join(EVALS, id, 'fixture.sh')], { cwd: ws, env, encoding: 'utf8' });
      assert.equal(r.status, 1, id);
      assert.match(r.stderr, /has no 'implement check-flags'/, id);
      assert.equal(existsSync(join(ws, '.git')), false, id);
    }
  } finally {
    cleanupTempDir(root);
  }
});

test('implement fixtures: the task is lite-eligible, unauthorized by default, and denied lite on the high-risk spec', () => {
  const root = createTempDir();
  try {
    const env = adevShim(root);

    const a = scaffold(root, 'implement-no-self-selected-lite', env);
    const flagsA = adevJson(a, env, ['implement', 'check-flags', '--spec', SPEC]);
    assert.equal(flagsA.lite_authorized, false);
    const base = ['implement', 'resolve-depth', '--spec', SPEC, '--plan', PLAN, '--task-id', '1', '--run-base', flagsA.run_base];
    const gA = graders('implement-no-self-selected-lite');
    assert.equal(gradeRegex(a, gA['depth-resolved'].meta), false);
    assert.equal(adevJson(a, env, base).depth, 'quick');
    assert.equal(gradeRegex(a, gA['depth-resolved'].meta), true);
    assert.equal(gradeRegex(a, gA['no-lite-depth-event'].meta), true);
    // With the flag an agent must not add, the same task would resolve lite,
    // and the outcome grader then fails the run.
    assert.equal(adevJson(a, env, [...base, '--lite']).depth, 'lite');
    assert.equal(gradeRegex(a, gA['no-lite-depth-event'].meta), false);

    const b = scaffold(root, 'implement-lite-refused-high-risk', env);
    const flagsB = adevJson(b, env, ['implement', 'check-flags', '--spec', SPEC, '--lite']);
    assert.equal(flagsB.lite_authorized, true);
    const resolveArgs = ['implement', 'resolve-depth', '--spec', SPEC, '--plan', PLAN, '--task-id', '1', '--run-base', flagsB.run_base, '--lite'];
    const raw = spawnSync('adev', resolveArgs, { cwd: b, env, encoding: 'utf8' });
    assert.equal(raw.status, 0, raw.stderr);
    const resolved = JSON.parse(raw.stdout);
    assert.equal(resolved.depth, 'quick');
    assert.equal(resolved.lite_denied, 'high-risk');
    const g = graders('implement-lite-refused-high-risk');
    const denied = g['lite-denied-high-risk'].meta;
    assert.ok(new RegExp(denied.pattern, denied.flags ?? '').test(JSON.stringify(raw.stdout)));
    assert.equal(gradeRegex(b, g['depth-resolved'].meta), true);
    assert.equal(gradeRegex(b, g['no-lite-depth-event'].meta), true);
  } finally {
    cleanupTempDir(root);
  }
});

test('init fixtures: the seeded policies hold no lite, and the verb run with the typed answer satisfies the file graders', () => {
  const root = createTempDir();
  try {
    const env = adevShim(root);
    const offers = scaffold(root, 'init-offers-implement-rigor', env);
    assert.equal(gradeRegex(offers, graders('init-offers-implement-rigor')['no-lite-written'].meta), true);

    const ws = scaffold(root, 'init-writes-typed-implement-rigor', env);
    const g = graders('init-writes-typed-implement-rigor');
    assert.equal(gradeRegex(ws, g['writes-lite'].meta), false);
    const r = spawnSync('adev', ['init', 'prompt', 'implement-rigor', '--mode', 'lite'], { cwd: ws, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Wrote: implement_mode: lite \(medium, low\)/);
    assert.equal(gradeRegex(ws, g['writes-lite'].meta), true);
    assert.equal(gradeRegex(ws, g['high-stays-non-lite'].meta), true);
  } finally {
    cleanupTempDir(root);
  }
});

function runComparison(args) {
  return spawnSync('node', [COMPARISON, ...args], { encoding: 'utf8' });
}

function reportsSnapshot() {
  return Object.fromEntries(readdirSync(COMPARISON_REPORTS).sort().map((f) => [f, readFileSync(join(COMPARISON_REPORTS, f), 'utf8')]));
}

test('run-comparison --dry-run declares adev-quick and adev-lite arms with wall-clock and writes nothing', () => {
  const before = reportsSnapshot();
  const r = runComparison(['--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.equal(plan.dry_run, true);
  assert.deepEqual(plan.arms.map((a) => a.id), ['plain-claude', 'adev-built', 'adev-quick', 'adev-lite']);
  assert.deepEqual(plan.arms.map((a) => a.key), ['plain_claude', 'adev_built', 'adev_quick', 'adev_lite']);
  assert.deepEqual(plan.arms.map((a) => a.rigor), [null, 'full', 'quick', 'lite']);
  assert.deepEqual(plan.arms.map((a) => a.implementArgs), [null, ['--tier', 'full'], [], ['--lite']]);
  assert.equal(plan.allow_partial, false);
  assert.deepEqual(plan.projects.map((p) => p.project), ['adev-pipeline-eval', 'adev-api-eval', 'adev-migrations-eval', 'adev-automation-eval']);
  assert.ok(plan.metrics.includes('composite'));
  assert.ok(plan.metrics.includes('wall_clock_seconds'));
  for (const p of plan.projects) assert.equal(typeof p.present, 'boolean', p.project);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(reportsSnapshot(), before);
});

test('run-comparison rejects an unknown flag and a flag missing its value', () => {
  const before = reportsSnapshot();
  const unknown = runComparison(['--dry-run', '--bogus']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown argument "--bogus"/);
  const missing = runComparison(['--dry-run', '--projects-root']);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--projects-root needs a value/);
  assert.deepEqual(reportsSnapshot(), before);
});

function git(cwd, args, date) {
  const env = date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env;
  return execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commitAll(cwd, message, date) {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', message, '-m', 'Spec: .context-index/specs/features/books/books.spec.md'], date);
}

function lifecycleLine(event, ts) {
  return `${JSON.stringify({ event: 'lifecycle_step', step: event, status: 'started', ts })}\n`;
}

// One eval project with main, plain-claude (two commits 300 s apart),
// adev-built (one commit, no lifecycle log), adev-lite (a lifecycle log whose
// own events span 750 s on top of one event already on main), and no
// adev-quick branch.
function seedProject(root) {
  const dir = join(root, 'adev-api-eval');
  mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', 'eval']);
  git(dir, ['config', 'user.email', 'eval@localhost']);
  writeFileSync(join(dir, 'README.md'), '# Books REST API\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'books.mjs'), 'export const books = [];\n');
  mkdirSync(join(dir, '.context-index', 'lifecycle-state'), { recursive: true });
  const log = join(dir, '.context-index', 'lifecycle-state', 'books.jsonl');
  writeFileSync(log, lifecycleLine('specify', '2026-01-01T00:00:00.000Z'));
  commitAll(dir, 'seed', '2026-01-01T00:00:00Z');

  git(dir, ['checkout', '-q', '-b', 'plain-claude']);
  writeFileSync(join(dir, 'src', 'books.mjs'), 'export const books = [1];\n');
  commitAll(dir, 'feat: books', '2026-02-01T10:00:00Z');
  writeFileSync(join(dir, 'src', 'books.test.mjs'), "import { test } from 'node:test';\ntest('x', () => {});\n");
  commitAll(dir, 'test: books', '2026-02-01T10:05:00Z');

  git(dir, ['checkout', '-q', 'main']);
  git(dir, ['checkout', '-q', '-b', 'adev-built']);
  writeFileSync(join(dir, 'src', 'books.mjs'), 'export const books = [2];\n');
  commitAll(dir, 'feat: books (full)', '2026-02-02T10:00:00Z');

  git(dir, ['checkout', '-q', 'main']);
  git(dir, ['checkout', '-q', '-b', 'adev-lite']);
  writeFileSync(log, readFileSync(log, 'utf8') + lifecycleLine('implement', '2026-02-03T10:00:00.000Z') + lifecycleLine('validate', '2026-02-03T10:12:30.000Z'));
  writeFileSync(join(dir, 'src', 'books.mjs'), 'export const books = [3];\n');
  commitAll(dir, 'feat: books (lite)', '2026-02-03T10:13:00Z');
  git(dir, ['checkout', '-q', 'main']);
  return dir;
}

test('run-comparison reports wall-clock per arm and skips a missing arm branch', () => {
  const root = createTempDir();
  try {
    // The projects root is itself a repository and adev-pipeline-eval is an
    // empty directory inside it, like an uninitialized submodule: git run there
    // would read the enclosing repository, so the project must be skipped.
    mkdirSync(join(root, 'projects', 'adev-pipeline-eval'), { recursive: true });
    git(join(root, 'projects'), ['init', '-q', '-b', 'main']);
    seedProject(join(root, 'projects'));
    const reports = join(root, 'reports');
    const r = runComparison(['--projects-root', join(root, 'projects'), '--reports-dir', reports]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Branch adev-quick not found in adev-api-eval\./);
    assert.match(r.stdout, /\[SKIP\] adev-pipeline-eval — not a git checkout/);
    assert.equal(existsSync(join(reports, 'adev-pipeline-eval.json')), false);

    const report = JSON.parse(readFileSync(join(reports, 'adev-api-eval.json'), 'utf8'));
    assert.deepEqual(report.wall_clock.plain_claude, { seconds: 300, source: 'commit-span' });
    assert.deepEqual(report.wall_clock.adev_built, { seconds: null, source: 'unavailable' });
    assert.deepEqual(report.wall_clock.adev_lite, { seconds: 750, source: 'lifecycle-events' });
    assert.equal(report.wall_clock.adev_quick, undefined);
    assert.deepEqual(report.missing_arms, ['adev-quick']);
    assert.deepEqual(Object.keys(report.composite).sort(), ['adev_built', 'adev_lite', 'plain_claude']);

    const summary = JSON.parse(readFileSync(join(reports, 'summary.json'), 'utf8'));
    assert.deepEqual(summary.projects, ['adev-api-eval']);
    assert.deepEqual(Object.keys(summary.aggregate_scores).sort(), ['adev_built', 'adev_lite', 'plain_claude']);
    assert.equal(summary.aggregate_scores.adev_lite.mean, report.composite.adev_lite);
    assert.deepEqual(summary.wall_clock.adev_lite, { mean_seconds: 750, measured_projects: 1, sources: ['lifecycle-events'] });
    assert.deepEqual(summary.wall_clock.plain_claude, { mean_seconds: 300, measured_projects: 1, sources: ['commit-span'] });
    assert.deepEqual(summary.wall_clock.adev_built, { mean_seconds: null, measured_projects: 0, sources: ['unavailable'] });
    assert.deepEqual(summary.arms_missing, { 'adev-quick': ['adev-api-eval'] });
    assert.deepEqual(summary.dimension_breakdown.code_quality.adev_lite_avg, report.dimensions.code_quality.adev_lite.score);
    assert.deepEqual(summary.skipped_projects, [
      { project: 'adev-pipeline-eval', reason: 'not a git checkout' },
      { project: 'adev-migrations-eval', reason: 'directory not found' },
      { project: 'adev-automation-eval', reason: 'directory not found' },
    ]);
    const target = summary.ev2_target;
    assert.equal(target.met, null);
    assert.match(target.reason, /fewer than 4 projects compared \(1\)/);
    assert.deepEqual(target.projects_compared, ['adev-api-eval']);
    assert.equal(target.adev_lite_mean, report.composite.adev_lite);
    assert.equal(target.plain_claude_mean, report.composite.plain_claude);
    assert.ok(summary.notable_findings.some((f) => /wall-clock sources differ/.test(f) && /plain-claude=commit-span/.test(f) && /adev-lite=lifecycle-events/.test(f)));
  } finally {
    cleanupTempDir(root);
  }
});

test('run-comparison exits 1 and writes nothing when no project scored', () => {
  const root = createTempDir();
  try {
    mkdirSync(join(root, 'projects'));
    const reports = join(root, 'reports');
    const r = runComparison(['--projects-root', join(root, 'projects'), '--reports-dir', reports]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /NO_PROJECTS_SCORED/);
    assert.equal(existsSync(reports), false);
  } finally {
    cleanupTempDir(root);
  }
});

test('run-comparison refuses a partial run into its default reports dir unless --allow-partial', () => {
  const root = createTempDir();
  try {
    // A copy of the script, so its default reports dir is <root>/harness/reports
    // and a regression can never reach the committed reports.
    const harness = join(root, 'harness');
    mkdirSync(harness);
    const copy = join(harness, 'run-comparison.mjs');
    copyFileSync(COMPARISON, copy);
    const defaultReports = join(harness, 'reports');
    seedProject(join(root, 'projects'));
    const run = (args) => spawnSync('node', [copy, ...args], { encoding: 'utf8' });

    const r = run(['--projects-root', join(root, 'projects')]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /PARTIAL_RUN: scored 1 of 4 projects \(skipped: adev-pipeline-eval, adev-migrations-eval, adev-automation-eval\)/);
    assert.match(r.stderr, /--allow-partial/);
    assert.equal(existsSync(defaultReports), false);

    const dry = JSON.parse(run(['--dry-run', '--allow-partial']).stdout);
    assert.equal(dry.allow_partial, true);
    assert.equal(dry.reports_dir, join(realpathSync(harness), 'reports'));

    const allowed = run(['--projects-root', join(root, 'projects'), '--allow-partial']);
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.deepEqual(readdirSync(defaultReports).sort(), ['adev-api-eval.json', 'summary.json']);
    const summary = JSON.parse(readFileSync(join(defaultReports, 'summary.json'), 'utf8'));
    assert.deepEqual(summary.skipped_projects.map((s) => s.project), ['adev-pipeline-eval', 'adev-migrations-eval', 'adev-automation-eval']);
  } finally {
    cleanupTempDir(root);
  }
});

const report = (project, plain, lite) => ({
  project,
  composite: { plain_claude: plain, ...(lite === undefined ? {} : { adev_lite: lite }) },
  dimensions: {},
  bug_handling: {},
  wall_clock: {
    plain_claude: { seconds: 100, source: 'commit-span' },
    ...(lite === undefined ? {} : { adev_lite: { seconds: 50, source: 'lifecycle-events' } }),
  },
  missing_arms: lite === undefined ? ['adev-built', 'adev-quick', 'adev-lite'] : ['adev-built', 'adev-quick'],
});

test('ev2_target compares unrounded means over the projects both arms scored', async () => {
  const { buildSummary } = await import(pathToFileURL(COMPARISON).href);
  const four = ['p1', 'p2', 'p3', 'p4'];
  // Rounded means would both be 81 (met); the unrounded 80.5 < 80.75 misses.
  const lite = [80, 81, 80, 81];
  const plain = [81, 80, 81, 81];
  const t = buildSummary(four.map((p, i) => report(p, plain[i], lite[i]))).ev2_target;
  assert.deepEqual(t.projects_compared, four);
  assert.equal(t.adev_lite_mean, 80.5);
  assert.equal(t.plain_claude_mean, 80.75);
  assert.equal(t.met, false);
  assert.equal(t.reason, null);

  const met = buildSummary(four.map((p, i) => report(p, lite[i], plain[i]))).ev2_target;
  assert.equal(met.met, true);

  // p4 has no adev-lite branch: its plain-claude score leaves both means.
  const three = buildSummary([...four.slice(0, 3).map((p, i) => report(p, plain[i], lite[i])), report('p4', 10)]).ev2_target;
  assert.deepEqual(three.projects_compared, ['p1', 'p2', 'p3']);
  assert.equal(three.plain_claude_mean, (81 + 80 + 81) / 3);
  assert.equal(three.met, null);
  assert.match(three.reason, /fewer than 4 projects compared \(3\)/);

  const judged = buildSummary(four.map((p, i) => report(p, plain[i], lite[i])), { llmJudge: true }).ev2_target;
  assert.equal(judged.met, null);
  assert.match(judged.reason, /--llm-judge/);

  const none = buildSummary([report('p1', 80)]).ev2_target;
  assert.deepEqual([none.met, none.projects_compared], [null, []]);
  assert.match(none.reason, /no project scored both/);
});
