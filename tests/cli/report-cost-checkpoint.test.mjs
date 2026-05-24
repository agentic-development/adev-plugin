// tests/cli/report-cost-checkpoint.test.mjs
//
// Tests for `adev report --type cost-checkpoint` (lib/cli/report.mjs).
//
// Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md
// Plan: .context-index/specs/features/session-awareness/cost-checkpoint-events.plan.md (Task 4)
//
// Coverage:
//   1. --totals-json mode: event appended, exit 0, silent stdout
//   2. --from-summary mode: reads aggregator, appends event, exit 0
//   3. --from-summary with no aggregator data: no event appended, exit 0
//   4. --totals-json + --from-summary mutual exclusion: exit 1
//   5. Missing --step: exit 1
//   6. --step not in allowed set: exit 1
//   7. --totals-json not valid JSON: exit 1
//   8. --totals-json non-object (array): exit 1
//   9. --totals-json with non-finite top-level number: exit 1
//  10. Spec path traversal: exit 1
//  11. Spec not found: exit 1
//  12. Neither --totals-json nor --from-summary: exit 1
//  13. Missing --spec: exit 1

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
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-rcc-cli-')));
  mkdirSync(join(dir, '.context-index', 'specs', 'features', 'm'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\n',
  );
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function writeSpec(dir, relPath, body = '# Spec\n') {
  const abs = join(dir, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
  return abs;
}

function readLog(dir, slug) {
  const logPath = join(dir, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

const SPEC_REL = '.context-index/specs/features/m/my-feature.spec.md';
const SPEC_SLUG = 'my-feature';
const TOTALS_JSON = JSON.stringify({
  input_tokens: 100,
  output_tokens: 200,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cost_usd: 0.001,
  wall_seconds: 5,
});

// ── Test 1: --totals-json mode appends event, exit 0, silent stdout ──────────

test('--type cost-checkpoint --totals-json appends event; exit 0; silent stdout', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, '', 'stdout must be silent on success');

    const events = readLog(dir, SPEC_SLUG);
    const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
    assert.strictEqual(checkpoints.length, 1);
    assert.strictEqual(checkpoints[0].step, 'review');
    assert.strictEqual(checkpoints[0].totals.input_tokens, 100);
  } finally {
    cleanup(dir);
  }
});

// ── Test 2: --from-summary mode appends event when data exists ───────────────

test('--type cost-checkpoint --from-summary appends event when session data exists', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);

    // Write a minimal .session-tracking.jsonl with matching spec_ref
    // so aggregate() returns non-null totals
    const trackingPath = join(dir, '.context-index', '.session-tracking.jsonl');
    writeFileSync(trackingPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      spec_ref: SPEC_REL,
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 500,
        output_tokens: 800,
        cache_read_tokens: 1000,
        cache_creation_tokens: 200,
        cost_usd: 0.05,
      },
    }) + '\n');

    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'implement',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, '', 'stdout must be silent on success');

    const events = readLog(dir, SPEC_SLUG);
    const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
    assert.strictEqual(checkpoints.length, 1, 'should append exactly one cost_checkpoint event');
    assert.strictEqual(checkpoints[0].step, 'implement');
    assert.ok(checkpoints[0].totals, 'totals must be present');
    assert.ok(typeof checkpoints[0].totals.input_tokens === 'number');
  } finally {
    cleanup(dir);
  }
});

// ── Test 3: --from-summary with no aggregator data → no event, exit 0 ────────

test('--type cost-checkpoint --from-summary with no data: no event appended, exit 0', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    // No .session-tracking.jsonl → aggregate returns totals: null

    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'plan',
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.strictEqual(r.stdout, '', 'stdout must be silent');

    const events = readLog(dir, SPEC_SLUG);
    const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
    assert.strictEqual(checkpoints.length, 0, 'no event should be appended when totals is null');
  } finally {
    cleanup(dir);
  }
});

// ── Test 4: --totals-json + --from-summary mutual exclusion ─────────────────

test('--totals-json and --from-summary are mutually exclusive: exit 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--totals-json', TOTALS_JSON,
      '--from-summary',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /mutually exclusive/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 5: Missing --step → exit 1 ─────────────────────────────────────────

test('missing --step exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--step/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 6: --step not in allowed set → exit 1 ──────────────────────────────

test('--step outside allowed set exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'deploy',
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /review, plan, route, implement, validate/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 7: --totals-json not valid JSON → exit 1 ───────────────────────────

test('--totals-json not valid JSON exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--totals-json', '{not json',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /could not be parsed/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 8: --totals-json non-object (array) → exit 1 ───────────────────────

test('--totals-json parses to array (non-object) exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--totals-json', '[1, 2, 3]',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /must be a JSON object/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 9: --totals-json with non-finite top-level number → exit 1 ──────────

test('--totals-json with non-finite top-level number exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    // JSON.stringify(Infinity) produces "null" — need to craft manually
    const badJson = '{"input_tokens":100,"cost_usd":1e999}';
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
      '--totals-json', badJson,
    ], { encoding: 'utf8', cwd: dir });

    // 1e999 parses to Infinity in JSON.parse — should be rejected
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /finite/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 10: Spec path traversal → exit 1 ────────────────────────────────────

test('spec path traversal exits 1', () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', '../../etc/passwd',
      '--step', 'review',
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /spec not found|outside/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 11: Spec not found → exit 1 ─────────────────────────────────────────

test('spec not found exits 1', () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', '.context-index/specs/features/m/nonexistent.spec.md',
      '--step', 'review',
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /spec not found/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 12: Neither --totals-json nor --from-summary → exit 1 ───────────────

test('neither --totals-json nor --from-summary exits 1', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--spec', SPEC_REL,
      '--step', 'review',
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /requires --totals-json or --from-summary/i);
  } finally {
    cleanup(dir);
  }
});

// ── Test 13: Missing --spec → exit 1 ─────────────────────────────────────────

test('missing --spec exits 1', () => {
  const dir = makeTempProject();
  try {
    const r = spawnSync('node', [
      CLI, 'report',
      '--type', 'cost-checkpoint',
      '--step', 'review',
      '--totals-json', TOTALS_JSON,
    ], { encoding: 'utf8', cwd: dir });

    assert.strictEqual(r.status, 1);
    assert.match(r.stderr + r.stdout, /--spec/i);
  } finally {
    cleanup(dir);
  }
});
