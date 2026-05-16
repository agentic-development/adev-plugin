/**
 * Unit tests for lib/spec-status.mjs
 *
 * Covers Behavior 8 + Postcondition (shared module) from
 * .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md.
 * This is the canonical home of the legal spec frontmatter status enum;
 * all other writers (lib + skills) cite this module.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SPEC_STATUSES, assertLegalStatus } from '../../lib/spec-status.mjs';

test('SPEC_STATUSES contains the seven canonical status values', () => {
  // The seven legal spec.md frontmatter status values per Behavior 8.
  assert.deepEqual(
    [...SPEC_STATUSES].sort(),
    ['draft', 'implemented', 'review-blocked', 'review-passed', 'review-pending', 'superseded', 'validated'],
  );
  assert.equal(SPEC_STATUSES.length, 7, 'must be exactly seven legal statuses');
});

test('SPEC_STATUSES is frozen (read-only)', () => {
  assert.ok(Object.isFrozen(SPEC_STATUSES), 'SPEC_STATUSES must be frozen so callers cannot mutate it');
});

test('assertLegalStatus accepts every legal status without throwing', () => {
  for (const legal of SPEC_STATUSES) {
    assert.doesNotThrow(
      () => assertLegalStatus(legal),
      `assertLegalStatus must accept the legal status "${legal}"`,
    );
  }
});

test('assertLegalStatus throws SPEC_STATUS_INVALID on out-of-enum input', () => {
  assert.throws(
    () => assertLegalStatus('bogus'),
    (err) => err.code === 'SPEC_STATUS_INVALID',
    'must throw an error with code SPEC_STATUS_INVALID',
  );
});

test('assertLegalStatus throws SPEC_STATUS_INVALID for empty string', () => {
  assert.throws(
    () => assertLegalStatus(''),
    (err) => err.code === 'SPEC_STATUS_INVALID',
  );
});

test('assertLegalStatus throws SPEC_STATUS_INVALID for non-string input', () => {
  assert.throws(
    () => assertLegalStatus(null),
    (err) => err.code === 'SPEC_STATUS_INVALID',
  );
  assert.throws(
    () => assertLegalStatus(undefined),
    (err) => err.code === 'SPEC_STATUS_INVALID',
  );
  assert.throws(
    () => assertLegalStatus(42),
    (err) => err.code === 'SPEC_STATUS_INVALID',
  );
});

test('assertLegalStatus error message includes the offending value', () => {
  try {
    assertLegalStatus('not-a-real-status');
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.code, 'SPEC_STATUS_INVALID');
    assert.match(err.message, /not-a-real-status/);
  }
});
