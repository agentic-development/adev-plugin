// tests/cli/report-step-from-summary.test.mjs
//
// Tests for `adev report --type step --status completed --from-summary`.
// Verifies that cost fields (totals, model_breakdown) are embedded in the
// step_completed event when session data is available, and that the flag
// is silently ignored when no data exists.

import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-step-fs-')));
  mkdirSync(join(dir, '.context-index', 'specs', 'features', 'm'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\n',
  );
  return dir;
}

function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeSpec(dir, relPath) {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, '# Spec\n');
  return abs;
}

function readLog(dir, slug) {
  const logPath = join(dir, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

const SPEC_REL = '.context-index/specs/features/m/my-feature.spec.md';
const SPEC_SLUG = 'my-feature';

function writeSessionEntry(dir, specRef) {
  const trackingPath = join(dir, '.context-index', '.session-tracking.jsonl');
  writeFileSync(trackingPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    spec_ref: specRef,
    model: 'claude-sonnet-4-6',
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: 2000,
      cache_creation_tokens: 100,
      cost_usd: 0.012,
      wall_seconds: 30,
    },
  }) + '\n');
}

// ── Test 1: --from-summary embeds cost fields in step_completed ───────────────

test('--from-summary embeds totals in step_completed when session data exists', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    writeSessionEntry(dir, SPEC_REL);

    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'step',
      '--spec', SPEC_REL,
      '--step', 'implement',
      '--status', 'completed',
      '--verdict', 'PASS',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, '', 'stdout must be silent on success');

    const events = readLog(dir, SPEC_SLUG);
    const completed = events.filter((e) => e.event === 'step_completed');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].step, 'implement');
    assert.strictEqual(completed[0].verdict, 'PASS');
    assert.ok(completed[0].totals, 'totals should be present');
    assert.strictEqual(typeof completed[0].totals.cost_usd, 'number');
    assert.ok(completed[0].totals.input_tokens > 0);
  } finally {
    cleanup(dir);
  }
});

// ── Test 2: --from-summary with no session data → no totals, still appends ───

test('--from-summary with no session data appends step_completed without totals', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    // No .session-tracking.jsonl written

    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'step',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--status', 'completed',
      '--verdict', 'PASS_WITH_NOTES',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);

    const events = readLog(dir, SPEC_SLUG);
    const completed = events.filter((e) => e.event === 'step_completed');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].verdict, 'PASS_WITH_NOTES');
    assert.strictEqual(completed[0].totals, undefined, 'totals should be absent when no data');
  } finally {
    cleanup(dir);
  }
});

// ── Test 3: --from-summary only valid with --status completed ────────────────

test('--from-summary with --status started exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'step',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--status', 'started',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--from-summary is only valid with --status completed/);
  } finally {
    cleanup(dir);
  }
});

// ── Test 4: --from-summary with --status failed exits 1 ─────────────────────

test('--from-summary with --status failed exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'step',
      '--spec', SPEC_REL,
      '--step', 'validate',
      '--status', 'failed',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--from-summary is only valid with --status completed/);
  } finally {
    cleanup(dir);
  }
});

// ── Test 5: without --from-summary, step_completed has no cost fields ────────

test('step_completed without --from-summary has no totals field', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    writeSessionEntry(dir, SPEC_REL);

    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'step',
      '--spec', SPEC_REL,
      '--step', 'plan',
      '--status', 'completed',
      '--verdict', 'PASS',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0);

    const events = readLog(dir, SPEC_SLUG);
    const completed = events.filter((e) => e.event === 'step_completed');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].totals, undefined);
  } finally {
    cleanup(dir);
  }
});
