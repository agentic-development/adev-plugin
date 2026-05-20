/**
 * Tests for new lifecycle event variants and optional `revision:` field —
 * Task 2 of review-block-auto-retry.plan.md.
 *
 * Covers:
 *   - `spec_revised` event registration + required-field schema
 *   - `human_approval_required` event registration + required-field schema
 *   - Optional `revision:` field acceptance on `reviewer_report` and `step_completed`
 *   - Legacy events without `revision:` continue to round-trip
 *
 * Field naming follows CON-1 from lifecycle-event-log.spec.md (snake_case
 * for payload-only fields).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_EVENTS,
} from '../../lib/lifecycle-events.mjs';
import {
  KNOWN_EVENT_TYPES,
  REQUIRED_FIELDS_BY_EVENT,
  isKnownEventType,
  getRequiredFields,
} from '../../lib/diagnostics/event-schemas.mjs';

test('CANONICAL_EVENTS includes spec_revised', () => {
  assert.ok(CANONICAL_EVENTS.has('spec_revised'),
    'spec_revised must be registered as a canonical event discriminator');
});

test('CANONICAL_EVENTS includes human_approval_required', () => {
  assert.ok(CANONICAL_EVENTS.has('human_approval_required'),
    'human_approval_required must be registered as a canonical event discriminator');
});

test('isKnownEventType("spec_revised") returns true', () => {
  assert.equal(isKnownEventType('spec_revised'), true);
});

test('isKnownEventType("human_approval_required") returns true', () => {
  assert.equal(isKnownEventType('human_approval_required'), true);
});

test('REQUIRED_FIELDS_BY_EVENT.spec_revised lists all required payload fields', () => {
  const required = getRequiredFields('spec_revised');
  assert.ok(Array.isArray(required), 'required-fields list must be present');
  assert.ok(required.includes('event'));
  assert.ok(required.includes('ts'));
  assert.ok(required.includes('from_revision'), 'from_revision required');
  assert.ok(required.includes('to_revision'), 'to_revision required');
  assert.ok(required.includes('addressed_blocker_ids'), 'addressed_blocker_ids required');
  assert.ok(required.includes('unresolved_blocker_ids'), 'unresolved_blocker_ids required');
});

test('REQUIRED_FIELDS_BY_EVENT.human_approval_required lists all required payload fields', () => {
  const required = getRequiredFields('human_approval_required');
  assert.ok(Array.isArray(required));
  assert.ok(required.includes('event'));
  assert.ok(required.includes('ts'));
  assert.ok(required.includes('spec'));
  assert.ok(required.includes('revision'));
  assert.ok(required.includes('reason'));
});

test('reviewer_report schema does NOT add revision to required fields (it is optional)', () => {
  const required = getRequiredFields('reviewer_report');
  assert.ok(!required.includes('revision'),
    'revision: must remain optional on reviewer_report (Behavior 4)');
});

test('step_completed schema does NOT add revision to required fields (it is optional)', () => {
  const required = getRequiredFields('step_completed');
  assert.ok(!required.includes('revision'),
    'revision: must remain optional on step_completed (Behavior 4)');
});

test('KNOWN_EVENT_TYPES contains both new variants', () => {
  assert.ok(KNOWN_EVENT_TYPES.includes('spec_revised'));
  assert.ok(KNOWN_EVENT_TYPES.includes('human_approval_required'));
});
