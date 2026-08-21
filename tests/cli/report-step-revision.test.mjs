// tests/cli/report-step-revision.test.mjs
//
// Tests for `adev report --type step --revision <n>` (adev-plugin-656e).
//
// `reportStep()` (lib/lifecycle-state.mjs) already fully supports and
// validates a `revision` argument per review-block-auto-retry.spec.md
// Behavior 4 — only the CLI wrapper never exposed a flag for it. Without a
// way to tag a hand-authored spec revision (the only available path while
// `adev specify revise --auto` has two open P1 bugs), every step_completed
// event folds into currentState().steps.review.byRevision["1"] regardless of
// which revision actually produced it, and the resulting projection's
// top-level `verdict` can directly contradict `aggregated_synthesized`.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');
const SPEC_REL = '.context-index/specs/features/m/sample.spec.md';

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-step-revision-')));
  mkdirSync(join(dir, '.context-index', 'specs', 'features', 'm'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n');
  writeFileSync(join(dir, SPEC_REL), '# Sample\n');
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function readLog(dir, slug) {
  const logPath = join(dir, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8').split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI, 'report', ...args], { cwd: dir, encoding: 'utf8' });
}

test('--type step --revision <n> tags the step_completed event with revision', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'step', '--spec', SPEC_REL, '--step', 'review',
      '--status', 'completed', '--verdict', 'PASS_WITH_NOTES', '--revision', '4',
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const events = readLog(dir, 'sample');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'step_completed');
    assert.strictEqual(events[0].revision, 4);
  } finally {
    cleanup(dir);
  }
});

test('--type step without --revision omits the field entirely (unchanged legacy behavior)', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ['--type', 'step', '--spec', SPEC_REL, '--step', 'review', '--status', 'completed']);
    assert.strictEqual(r.status, 0, r.stderr);
    const [ev] = readLog(dir, 'sample');
    assert.ok(!('revision' in ev), 'no --revision means no revision key, not revision: null');
  } finally {
    cleanup(dir);
  }
});

test('--type step --revision 0 is rejected (must be >= 1)', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ['--type', 'step', '--spec', SPEC_REL, '--step', 'review', '--status', 'completed', '--revision', '0']);
    assert.notStrictEqual(r.status, 0);
    assert.strictEqual(readLog(dir, 'sample').length, 0, 'a rejected revision must not partially write');
  } finally {
    cleanup(dir);
  }
});

test('--type step --revision abc (non-numeric) is rejected with a clear CLI-level error', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ['--type', 'step', '--spec', SPEC_REL, '--step', 'review', '--status', 'completed', '--revision', 'abc']);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /--revision/);
  } finally {
    cleanup(dir);
  }
});

test('--type step --revision composes with --from-summary', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'step', '--spec', SPEC_REL, '--step', 'implement',
      '--status', 'completed', '--revision', '2', '--from-summary',
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const [ev] = readLog(dir, 'sample');
    assert.strictEqual(ev.revision, 2);
  } finally {
    cleanup(dir);
  }
});

test('--help documents --revision under --type step', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ['--help']);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /--revision/);
  } finally {
    cleanup(dir);
  }
});
