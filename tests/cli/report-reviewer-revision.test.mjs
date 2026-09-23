// tests/cli/report-reviewer-revision.test.mjs
//
// Tests for `adev report --type reviewer --revision <n>` (adev-plugin-gkfv.3).
//
// `reportReviewer()` (lib/lifecycle-state.mjs) already fully supports and
// validates a `revision` argument per review-block-auto-retry.spec.md
// Behavior 4 — the CLI wrapper's `--type step` branch already forwards
// `--revision`, but the `--type reviewer` branch never read `v.revision` at
// all, so a caller-supplied `--revision` silently vanished: no error, and no
// `revision` key on the written `reviewer_report` event. Every CLI-emitted
// reviewer_report therefore folded into currentState().steps.review.byRevision[1]
// regardless of the actual spec revision.

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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-reviewer-revision-')));
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

test('--type reviewer --revision <n> tags the reviewer_report event with revision', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'reviewer', '--spec', SPEC_REL, '--step', 'review',
      '--reviewer', 'structural-review', '--verdict', 'PASS', '--revision', '2',
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const events = readLog(dir, 'sample');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'reviewer_report');
    assert.strictEqual(events[0].revision, 2);
  } finally {
    cleanup(dir);
  }
});

test('--type reviewer without --revision omits the field entirely (unchanged legacy behavior)', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'reviewer', '--spec', SPEC_REL, '--step', 'review',
      '--reviewer', 'structural-review', '--verdict', 'PASS',
    ]);
    assert.strictEqual(r.status, 0, r.stderr);
    const [ev] = readLog(dir, 'sample');
    assert.ok(!('revision' in ev), 'no --revision means no revision key, not revision: null');
  } finally {
    cleanup(dir);
  }
});

test('--type reviewer --revision 0 is rejected (must be >= 1)', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'reviewer', '--spec', SPEC_REL, '--step', 'review',
      '--reviewer', 'structural-review', '--verdict', 'PASS', '--revision', '0',
    ]);
    assert.notStrictEqual(r.status, 0);
    assert.strictEqual(readLog(dir, 'sample').length, 0, 'a rejected revision must not partially write');
  } finally {
    cleanup(dir);
  }
});

test('--type reviewer --revision abc (non-numeric) is rejected with a clear CLI-level error', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, [
      '--type', 'reviewer', '--spec', SPEC_REL, '--step', 'review',
      '--reviewer', 'structural-review', '--verdict', 'PASS', '--revision', 'abc',
    ]);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /--revision/);
  } finally {
    cleanup(dir);
  }
});

test('--help documents --revision under --type reviewer', () => {
  const dir = makeTempProject();
  try {
    const r = runCli(dir, ['--help']);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /--type reviewer[\s\S]*--revision/);
  } finally {
    cleanup(dir);
  }
});
