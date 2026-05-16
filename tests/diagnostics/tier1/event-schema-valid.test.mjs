/**
 * Producer-level tests for lib/diagnostics/tier1/event-schema-valid.mjs.
 *
 * Covers Behavior 7 of diagnostic-registry.spec.md rev 2:
 *   - closed discriminator: all 9 canonical types accepted; typos rejected.
 *   - open per-type shape: required fields enforced, extras pass through.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { run } from '../../../lib/diagnostics/tier1/event-schema-valid.mjs';
import { KNOWN_EVENT_TYPES, REQUIRED_FIELDS_BY_EVENT } from '../../../lib/diagnostics/event-schemas.mjs';

function makeEvent(type, extras = {}) {
  const required = REQUIRED_FIELDS_BY_EVENT[type];
  const event = { event: type, ts: '2026-01-01T00:00:00.000Z' };
  for (const field of required) {
    if (event[field] !== undefined) continue;
    // Provide a plausible non-null value for each required field.
    switch (field) {
      case 'step': event.step = 'review'; break;
      case 'reviewer': event.reviewer = 'r1'; break;
      case 'validator': event.validator = 'v1'; break;
      case 'verdict': event.verdict = 'PASS'; break;
      case 'severity': event.severity = 'error'; break;
      case 'plan': event.plan = 'some.plan.md'; break;
      case 'task_id': event.task_id = 'task-1'; break;
      case 'status': event.status = 'done'; break;
      case 'kind': event.kind = 'debug'; break;
      case 'note': event.note = 'n'; break;
      default: event[field] = 'x';
    }
  }
  return { ...event, ...extras };
}

test('returns { fired: false } when ctx.event is undefined (no-op outside write-time hook)', () => {
  assert.deepEqual(run({}), { fired: false });
});

test('returns { fired: false } when ctx.event is null', () => {
  assert.deepEqual(run({ event: null }), { fired: false });
});

test('fires error when event is not an object (string)', () => {
  const result = run({ event: 'not-an-object' });
  assert.equal(result.fired, true);
  assert.equal(result.severity, 'error');
  assert.equal(result.id, 'adev/event-schema-valid');
});

test('fires error when event is an array', () => {
  const result = run({ event: ['a', 'b'] });
  assert.equal(result.fired, true);
  assert.equal(result.severity, 'error');
});

test('fires error when event.event is missing', () => {
  const result = run({ event: { ts: '2026-01-01T00:00:00Z' } });
  assert.equal(result.fired, true);
  assert.equal(result.severity, 'error');
  assert.match(result.message, /non-empty string discriminator/);
});

test('fires error on unknown event discriminator (typo)', () => {
  const result = run({ event: { event: 'step-completed', ts: '2026-01-01T00:00:00Z', step: 'review' } });
  assert.equal(result.fired, true);
  assert.equal(result.severity, 'error');
  assert.match(result.message, /unknown event type/);
});

test('fires error on unknown discriminator (camelCase typo)', () => {
  const result = run({ event: { event: 'validatorReport', ts: '2026-01-01T00:00:00Z' } });
  assert.equal(result.fired, true);
  assert.match(result.message, /unknown event type/);
});

test('accepts every canonical KNOWN_EVENT_TYPES with valid required fields', () => {
  for (const type of KNOWN_EVENT_TYPES) {
    const event = makeEvent(type);
    const result = run({ event });
    assert.equal(
      result.fired,
      false,
      `${type} with full required fields should not fire; got: ${JSON.stringify(result)}`,
    );
  }
});

test('fires error when reviewer_report is missing severity', () => {
  const event = makeEvent('reviewer_report');
  delete event.severity;
  const result = run({ event });
  assert.equal(result.fired, true);
  assert.equal(result.severity, 'error');
  assert.match(result.message, /missing required field/);
  assert.match(result.message, /severity/);
});

test('fires error when validator_report is missing verdict', () => {
  const event = makeEvent('validator_report');
  delete event.verdict;
  const result = run({ event });
  assert.equal(result.fired, true);
  assert.match(result.message, /verdict/);
});

test('fires error when plan_task is missing task_id', () => {
  const event = makeEvent('plan_task');
  delete event.task_id;
  const result = run({ event });
  assert.equal(result.fired, true);
  assert.match(result.message, /task_id/);
});

test('extra fields beyond required are permitted (open per-type shape)', () => {
  const event = makeEvent('plan_task', { someNewField: 'whatever', anotherExtra: 42 });
  assert.deepEqual(run({ event }), { fired: false });
});

test('fires when ts is missing or non-string', () => {
  const event = makeEvent('reviewer_report');
  delete event.ts;
  const result = run({ event });
  assert.equal(result.fired, true);
  assert.match(result.message, /ts/);
});
