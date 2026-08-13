/**
 * Unit tests for lib/diagnostics/event-schemas.mjs.
 *
 * Covers Behavior 7 ("closed-discriminator / open-per-type-shape") of
 * .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md
 * rev 2, plus the rev 2 amendment 12 contract that this module mirrors
 * lifecycle-event-log.spec.md's CANONICAL_EVENTS authoritatively.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  KNOWN_EVENT_TYPES,
  REQUIRED_FIELDS_BY_EVENT,
  getRequiredFields,
  isKnownEventType,
} from '../../lib/diagnostics/event-schemas.mjs';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-state.mjs';

test('KNOWN_EVENT_TYPES is frozen', () => {
  assert.ok(Object.isFrozen(KNOWN_EVENT_TYPES), 'must be frozen');
});

test('KNOWN_EVENT_TYPES mirrors lib/lifecycle-state.mjs::CANONICAL_EVENTS exactly', () => {
  // Per diagnostic-registry.spec.md rev 2 amendment 12: this module is a
  // mechanical mirror of the canonical authority in lifecycle-state.mjs
  // (which in turn mirrors lifecycle-event-log.spec.md). Drift between
  // the two is the bug; the diagnostic exists precisely to detect drift,
  // so its own data must not drift first.
  assert.deepEqual(
    [...KNOWN_EVENT_TYPES].sort(),
    [...CANONICAL_EVENTS].sort(),
    'KNOWN_EVENT_TYPES must match CANONICAL_EVENTS or the diagnostic will report false positives',
  );
});

test('every known event type has a required-field schema entry', () => {
  for (const type of KNOWN_EVENT_TYPES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(REQUIRED_FIELDS_BY_EVENT, type),
      `missing required-field schema for known event type "${type}"`,
    );
    assert.ok(
      Array.isArray(REQUIRED_FIELDS_BY_EVENT[type]),
      `required fields for "${type}" must be an array`,
    );
  }
});

test('schema entries always include the two universal required fields (event + ts)', () => {
  // Every event in the canonical set carries `event` (the discriminator)
  // and `ts` (the timestamp). lifecycle-state.mjs::normaliseEventInPlace
  // stamps `ts` if missing, but the diagnostic still asserts its presence
  // because the event-schema-valid runner does not run that helper.
  for (const type of KNOWN_EVENT_TYPES) {
    const required = REQUIRED_FIELDS_BY_EVENT[type];
    assert.ok(required.includes('event'), `"${type}" missing required field "event"`);
    assert.ok(required.includes('ts'), `"${type}" missing required field "ts"`);
  }
});

test('reviewer_report requires step, reviewer, verdict, severity', () => {
  // Cross-checked against reportReviewer at lib/lifecycle-state.mjs:434-441.
  const required = REQUIRED_FIELDS_BY_EVENT.reviewer_report;
  for (const field of ['step', 'reviewer', 'verdict', 'severity']) {
    assert.ok(required.includes(field), `reviewer_report missing required field "${field}"`);
  }
});

test('validator_report requires step, validator, verdict, severity', () => {
  // Cross-checked against reportValidator at lib/lifecycle-state.mjs:473-484.
  const required = REQUIRED_FIELDS_BY_EVENT.validator_report;
  for (const field of ['step', 'validator', 'verdict', 'severity']) {
    assert.ok(required.includes(field), `validator_report missing required field "${field}"`);
  }
});

test('lifecycle_step requires step (the step-started discriminator)', () => {
  // Cross-checked against reportStep at lib/lifecycle-state.mjs:514-519 where
  // status === "started" writes { event: "lifecycle_step", step, status: "started" }.
  const required = REQUIRED_FIELDS_BY_EVENT.lifecycle_step;
  assert.ok(required.includes('step'), 'lifecycle_step missing required field "step"');
});

test('step_completed and step_failed require step', () => {
  for (const type of ['step_completed', 'step_failed']) {
    assert.ok(
      REQUIRED_FIELDS_BY_EVENT[type].includes('step'),
      `${type} missing required field "step"`,
    );
  }
});

test('plan_task requires plan, task_id, status', () => {
  // Cross-checked against reportPlanTask at lib/lifecycle-state.mjs:543-549.
  const required = REQUIRED_FIELDS_BY_EVENT.plan_task;
  for (const field of ['plan', 'task_id', 'status']) {
    assert.ok(required.includes(field), `plan_task missing required field "${field}"`);
  }
});

test('debug_intervention requires kind, note', () => {
  // Cross-checked against reportIntervention at lib/lifecycle-state.mjs:567-571.
  const required = REQUIRED_FIELDS_BY_EVENT.debug_intervention;
  for (const field of ['kind', 'note']) {
    assert.ok(required.includes(field), `debug_intervention missing required field "${field}"`);
  }
});

test('isKnownEventType accepts canonical discriminators and rejects others', () => {
  for (const type of KNOWN_EVENT_TYPES) {
    assert.equal(isKnownEventType(type), true);
  }
  assert.equal(isKnownEventType('step-completed'), false, 'hyphen typo should be rejected');
  assert.equal(isKnownEventType('validatorReport'), false, 'camelCase typo should be rejected');
  assert.equal(isKnownEventType('unknownEventNeverWritten'), false);
  assert.equal(isKnownEventType(''), false);
  assert.equal(isKnownEventType(null), false);
  assert.equal(isKnownEventType(undefined), false);
  assert.equal(isKnownEventType(42), false);
});

test('getRequiredFields returns the array for known types, undefined for unknown', () => {
  assert.ok(Array.isArray(getRequiredFields('plan_task')));
  assert.equal(getRequiredFields('not-a-real-event'), undefined);
});

test('test_depth_assigned requires plan, task_id, depth, floor_inputs, floor_legs', () => {
  const fields = getRequiredFields('test_depth_assigned');
  for (const f of ['plan', 'task_id', 'depth', 'floor_inputs', 'floor_legs']) {
    assert.ok(fields.includes(f), `expected ${f} in required fields`);
  }
});

test('test_depth_assigned is a known event type', () => {
  assert.equal(isKnownEventType('test_depth_assigned'), true);
});

test('REQUIRED_FIELDS_BY_EVENT and its arrays are frozen (immutable)', () => {
  assert.ok(Object.isFrozen(REQUIRED_FIELDS_BY_EVENT), 'top-level map must be frozen');
  for (const type of KNOWN_EVENT_TYPES) {
    assert.ok(
      Object.isFrozen(REQUIRED_FIELDS_BY_EVENT[type]),
      `required-field array for "${type}" must be frozen`,
    );
  }
});
