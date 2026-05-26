// tests/lib/lifecycle-state-step-cost.test.mjs
//
// Tests for cost fields embedded in step_completed events via reportStep().
// Verifies that totals/model_breakdown/skipped_lines are written when provided
// and absent when not, and that cost fields are silently ignored on started/failed.

import { test } from 'node:test';
import assert from 'node:assert';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

const { reportStep } = await import(`${PROJECT_ROOT}/lib/lifecycle-state.mjs`);

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-step-cost-')));
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
  mkdirSync(join(dir, relPath, '..').replace(/\/$/, ''), { recursive: true });
  writeFileSync(abs, '# Spec\n');
}

function readLog(dir, slug) {
  const logPath = join(dir, '.context-index', 'lifecycle-state', `${slug}.jsonl`);
  return readFileSync(logPath, 'utf8')
    .split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

const SPEC_REL = '.context-index/specs/features/m/my-feature.spec.md';
const TOTALS = {
  input_tokens: 14000,
  output_tokens: 18000,
  cache_read_tokens: 1170000,
  cache_creation_tokens: 22000,
  cost_usd: 0.34,
  wall_seconds: 252,
};
const MODEL_BREAKDOWN = [
  { model: 'claude-sonnet-4-6', cost_usd: 0.28, share: 0.823 },
];

// ── Test 1: cost fields present in step_completed ────────────────────────────

test('reportStep with totals embeds cost fields in step_completed', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    reportStep(dir, SPEC_REL, {
      step: 'implement',
      status: 'completed',
      verdict: 'PASS',
      totals: TOTALS,
      model_breakdown: MODEL_BREAKDOWN,
      skipped_lines: 2,
    });

    const events = readLog(dir, 'my-feature');
    assert.strictEqual(events.length, 1);
    const ev = events[0];
    assert.strictEqual(ev.event, 'step_completed');
    assert.strictEqual(ev.step, 'implement');
    assert.strictEqual(ev.verdict, 'PASS');
    assert.deepStrictEqual(ev.totals, TOTALS);
    assert.deepStrictEqual(ev.model_breakdown, MODEL_BREAKDOWN);
    assert.strictEqual(ev.skipped_lines, 2);
  } finally {
    cleanup(dir);
  }
});

// ── Test 2: step_completed without cost fields has no totals ─────────────────

test('reportStep without totals emits step_completed with no cost fields', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    reportStep(dir, SPEC_REL, { step: 'review', status: 'completed', verdict: 'PASS_WITH_NOTES' });

    const events = readLog(dir, 'my-feature');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'step_completed');
    assert.strictEqual(events[0].totals, undefined);
    assert.strictEqual(events[0].model_breakdown, undefined);
  } finally {
    cleanup(dir);
  }
});

// ── Test 3: cost fields ignored on lifecycle_step (started) ──────────────────

test('reportStep with totals on started status does not embed cost fields', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    reportStep(dir, SPEC_REL, {
      step: 'validate',
      status: 'started',
      totals: TOTALS,
    });

    const events = readLog(dir, 'my-feature');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'lifecycle_step');
    assert.strictEqual(events[0].totals, undefined, 'cost fields must not appear on lifecycle_step');
  } finally {
    cleanup(dir);
  }
});

// ── Test 4: cost fields ignored on step_failed ───────────────────────────────

test('reportStep with totals on failed status does not embed cost fields', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    reportStep(dir, SPEC_REL, {
      step: 'validate',
      status: 'failed',
      totals: TOTALS,
    });

    const events = readLog(dir, 'my-feature');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].event, 'step_failed');
    assert.strictEqual(events[0].totals, undefined);
  } finally {
    cleanup(dir);
  }
});

// ── Test 5: null totals treated as absent (no cost fields) ───────────────────

test('reportStep with null totals does not embed cost fields', () => {
  const dir = makeTempProject();
  try {
    writeSpec(dir, SPEC_REL);
    reportStep(dir, SPEC_REL, { step: 'plan', status: 'completed', verdict: 'PASS', totals: null });

    const events = readLog(dir, 'my-feature');
    assert.strictEqual(events[0].totals, undefined);
  } finally {
    cleanup(dir);
  }
});
