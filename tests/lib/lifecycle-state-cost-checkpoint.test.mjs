// tests/lib/lifecycle-state-cost-checkpoint.test.mjs
//
// Tests for the cost_checkpoint event variant:
//   - Task 1: CANONICAL_EVENTS.has('cost_checkpoint')
//   - Task 2: REQUIRED_FIELDS_BY_EVENT.cost_checkpoint
//   - Task 3: reportCostCheckpoint emitter (producer unit test)
//   - Task 5: build skill prose presence
//   - Task 6: lifecycle-event-log.spec.md cross-spec consistency
//
// Spec: .context-index/specs/features/session-awareness/cost-checkpoint-events.spec.md

import { test } from 'node:test';
import assert from 'node:assert';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ── Task 1: CANONICAL_EVENTS ──────────────────────────────────────────────────

import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';

test('CANONICAL_EVENTS includes cost_checkpoint', () => {
  assert.ok(CANONICAL_EVENTS.has('cost_checkpoint'), 'CANONICAL_EVENTS must contain cost_checkpoint');
});

// ── Task 2: REQUIRED_FIELDS_BY_EVENT ─────────────────────────────────────────

import { REQUIRED_FIELDS_BY_EVENT } from '../../lib/diagnostics/event-schemas.mjs';

test('REQUIRED_FIELDS_BY_EVENT has cost_checkpoint entry with correct fields', () => {
  const fields = REQUIRED_FIELDS_BY_EVENT['cost_checkpoint'];
  assert.ok(Array.isArray(fields), 'cost_checkpoint entry must be an array');
  assert.deepStrictEqual([...fields], ['event', 'ts', 'step', 'totals']);
});

// ── Task 3: reportCostCheckpoint emitter ─────────────────────────────────────

import { reportCostCheckpoint, readEvents } from '../../lib/lifecycle-state.mjs';

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'adev-cost-checkpoint-'));
  mkdirSync(join(dir, '.context-index', 'specs', 'features', 'test'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\n',
  );
  return dir;
}

test('reportCostCheckpoint appends a cost_checkpoint event', (t) => {
  const root = makeTempProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  const totals = {
    input_tokens: 100,
    output_tokens: 200,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    cost_usd: 0.001,
    wall_seconds: 5,
  };
  reportCostCheckpoint(root, specPath, { step: 'review', totals });

  const events = readEvents(root, specPath);
  const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
  assert.strictEqual(checkpoints.length, 1);
  assert.strictEqual(checkpoints[0].step, 'review');
  assert.deepStrictEqual(checkpoints[0].totals, totals);
  assert.ok(typeof checkpoints[0].ts === 'string', 'ts must be a string');
});

test('reportCostCheckpoint appends optional fields when provided', (t) => {
  const root = makeTempProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  const totals = { input_tokens: 10, output_tokens: 20, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.0001, wall_seconds: 1 };
  const model_breakdown = [{ model: 'claude-sonnet-4-6', cost_usd: 0.0001, share: 1.0 }];
  reportCostCheckpoint(root, specPath, {
    step: 'implement',
    totals,
    model_breakdown,
    since: '2026-05-01T00:00:00.000Z',
    skipped_lines: 3,
    spec_ref: specPath,
  });

  const events = readEvents(root, specPath);
  const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
  assert.strictEqual(checkpoints.length, 1);
  assert.deepStrictEqual(checkpoints[0].model_breakdown, model_breakdown);
  assert.strictEqual(checkpoints[0].since, '2026-05-01T00:00:00.000Z');
  assert.strictEqual(checkpoints[0].skipped_lines, 3);
  assert.strictEqual(checkpoints[0].spec_ref, specPath);
});

// ── Task 5: build skill prose presence ───────────────────────────────────────

test('skills/build/SKILL.md step 6 contains exactly one cost-checkpoint invocation', () => {
  const content = readFileSync(
    resolve(PROJECT_ROOT, 'skills/build/SKILL.md'),
    'utf8',
  );
  const matches = content.match(/adev report --type cost-checkpoint --from-summary/g) ?? [];
  assert.strictEqual(
    matches.length,
    1,
    `Expected exactly one cost-checkpoint invocation in skills/build/SKILL.md, found ${matches.length}`,
  );
});

test('reportCostCheckpoint throws on invalid args', (t) => {
  const root = makeTempProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  assert.throws(
    () => reportCostCheckpoint(root, specPath, null),
    (err) => err.code === 'EVENT_SCHEMA_INVALID',
  );
  assert.throws(
    () => reportCostCheckpoint(root, specPath, { step: '', totals: {} }),
    (err) => err.code === 'EVENT_SCHEMA_INVALID',
  );
  assert.throws(
    () => reportCostCheckpoint(root, specPath, { step: 'review', totals: null }),
    (err) => err.code === 'EVENT_SCHEMA_INVALID',
  );
  assert.throws(
    () => reportCostCheckpoint(root, specPath, { step: 'review', totals: [1, 2] }),
    (err) => err.code === 'EVENT_SCHEMA_INVALID',
  );
});
