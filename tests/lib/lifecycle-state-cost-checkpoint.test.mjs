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

// ── Imports ───────────────────────────────────────────────────────────────────

import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import { REQUIRED_FIELDS_BY_EVENT } from '../../lib/diagnostics/event-schemas.mjs';
import {
  appendEvent,
  reportCostCheckpoint,
  readEvents,
  GateError,
  _clearEventDiagnosticsRegistryCache,
} from '../../lib/lifecycle-state.mjs';

// ── Task 1: CANONICAL_EVENTS ──────────────────────────────────────────────────

test('CANONICAL_EVENTS includes cost_checkpoint', () => {
  assert.ok(CANONICAL_EVENTS.has('cost_checkpoint'), 'CANONICAL_EVENTS must contain cost_checkpoint');
});

// ── Task 2: REQUIRED_FIELDS_BY_EVENT ─────────────────────────────────────────

test('REQUIRED_FIELDS_BY_EVENT has cost_checkpoint entry with correct fields', () => {
  const fields = REQUIRED_FIELDS_BY_EVENT['cost_checkpoint'];
  assert.ok(Array.isArray(fields), 'cost_checkpoint entry must be an array');
  assert.deepStrictEqual([...fields], ['event', 'ts', 'step', 'totals']);
});

// ── Task 3: reportCostCheckpoint emitter ─────────────────────────────────────

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

// ── Task 6: lifecycle-event-log spec cross-spec consistency ──────────────────

test('lifecycle-event-log.spec.md canonical-events table includes cost_checkpoint', () => {
  const content = readFileSync(
    resolve(
      PROJECT_ROOT,
      '.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md',
    ),
    'utf8',
  );
  assert.ok(
    content.includes('cost_checkpoint'),
    'lifecycle-event-log.spec.md must mention cost_checkpoint in the canonical-events table',
  );
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

// ── Task 7: Additional coverage ──────────────────────────────────────────────

// 7a: Unknown discriminator regression guard — additive-change requirement
// (AC: "Logs containing events with unknown discriminators continue to parse
//  and project under unknownEvents[]")
test('unknown discriminators still project under unknownEvents[] (additive-change regression guard)', (t) => {
  const root = makeTempProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  // appendEvent does not validate the discriminator for unknown types — it just
  // logs them through. We write a cost_foo event (unknown) directly.
  // We must create a manifest with no event_diagnostics so there is no gate.
  const root2 = mkdtempSync(join(tmpdir(), 'adev-rcc-unknown-'));
  t.after(() => rmSync(root2, { recursive: true, force: true }));
  mkdirSync(join(root2, '.context-index', 'specs', 'features', 'test'), { recursive: true });
  writeFileSync(
    join(root2, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\n',
  );
  const sp2 = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root2, sp2), '# Spec\n');

  // Append an unknown event then a known cost_checkpoint event
  appendEvent(root2, sp2, { event: 'cost_foo', step: 'review', totals: {} });
  reportCostCheckpoint(root2, sp2, { step: 'review', totals: { input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0, wall_seconds: 0 } });

  const events = readEvents(root2, sp2);
  const unknown = events.filter((e) => e.event === 'cost_foo');
  const checkpoints = events.filter((e) => e.event === 'cost_checkpoint');
  assert.strictEqual(unknown.length, 1, 'unknown event must be preserved on read');
  assert.strictEqual(checkpoints.length, 1, 'cost_checkpoint event must be present');
});

// 7b: Diagnostic schema test — cost_checkpoint missing 'step' throws GateError in strict mode
test('cost_checkpoint event missing step is rejected in strict event_diagnostics mode', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'adev-rcc-strict-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.context-index', 'governance'), { recursive: true });
  mkdirSync(join(root, '.context-index', 'specs', 'features', 'test'), { recursive: true });
  writeFileSync(
    join(root, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\nlifecycle:\n  event_diagnostics: strict\n',
  );
  writeFileSync(
    join(root, '.context-index', 'governance', 'diagnostics.yaml'),
    [
      'diagnostics:',
      '  - id: adev/event-schema-valid',
      '    runner: plugin:tier1/event-schema-valid.mjs',
      '    severity: error',
      '    tier: 1',
      '    scope: event-impact',
    ].join('\n') + '\n',
  );
  _clearEventDiagnosticsRegistryCache();

  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  // A cost_checkpoint event is missing the required 'step' field — must throw GateError
  assert.throws(
    () => appendEvent(root, specPath, { event: 'cost_checkpoint', totals: { input_tokens: 1 } }),
    (err) => err instanceof GateError,
  );
});

// 7c: Append-only — duplicate (spec, step) pair appends new event (Behavior 9)
test('reportCostCheckpoint appends new event for same (spec, step) pair (append-only, Behavior 9)', (t) => {
  const root = makeTempProject();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const specPath = '.context-index/specs/features/test/my-feature.spec.md';
  writeFileSync(join(root, specPath), '# Spec\n');

  const totals = { input_tokens: 10, output_tokens: 20, cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0.001, wall_seconds: 1 };
  reportCostCheckpoint(root, specPath, { step: 'implement', totals });
  reportCostCheckpoint(root, specPath, { step: 'implement', totals });

  const events = readEvents(root, specPath);
  const checkpoints = events.filter((e) => e.event === 'cost_checkpoint' && e.step === 'implement');
  assert.strictEqual(checkpoints.length, 2, 'both events must be appended (append-only, Behavior 9)');
});
