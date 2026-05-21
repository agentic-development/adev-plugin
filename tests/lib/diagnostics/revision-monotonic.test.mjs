/**
 * Tests for the adev/revision-monotonic diagnostic (Task 8).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRevisionMonotonic } from '../../../lib/diagnostics/revision-monotonic.mjs';

test('checkRevisionMonotonic accepts prior=1, candidate=2', () => {
  const r = checkRevisionMonotonic(1, 2);
  assert.deepEqual(r, { prior: 1, candidate: 2 });
});

test('checkRevisionMonotonic accepts any prior N, candidate N+1', () => {
  assert.doesNotThrow(() => checkRevisionMonotonic(5, 6));
  assert.doesNotThrow(() => checkRevisionMonotonic(99, 100));
});

test('checkRevisionMonotonic rejects equal (no change) — REVISION_NOT_INCREMENTED', () => {
  assert.throws(
    () => checkRevisionMonotonic(3, 3),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
});

test('checkRevisionMonotonic rejects decrement — REVISION_NOT_INCREMENTED', () => {
  assert.throws(
    () => checkRevisionMonotonic(5, 4),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
  assert.throws(
    () => checkRevisionMonotonic(5, 1),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
});

test('checkRevisionMonotonic rejects skip-by-two (prior+2 or higher)', () => {
  assert.throws(
    () => checkRevisionMonotonic(2, 4),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
  assert.throws(
    () => checkRevisionMonotonic(1, 10),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
});

test('checkRevisionMonotonic rejects non-integer inputs', () => {
  assert.throws(
    () => checkRevisionMonotonic(1.5, 2),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
  assert.throws(
    () => checkRevisionMonotonic(1, '2'),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
  assert.throws(
    () => checkRevisionMonotonic(1, NaN),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
});

test('checkRevisionMonotonic rejects prior < 1 (revisions are 1-indexed)', () => {
  assert.throws(
    () => checkRevisionMonotonic(0, 1),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
  assert.throws(
    () => checkRevisionMonotonic(-1, 0),
    (e) => e.code === 'REVISION_NOT_INCREMENTED',
  );
});
