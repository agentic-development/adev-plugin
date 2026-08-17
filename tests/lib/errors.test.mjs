/**
 * Tests for lib/errors.mjs — shared coded-error constructor.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `codedError`/`refuse` replaced ~19 identical local `mkErr`/`coded`/
 * `makeError`/`refuse` reimplementations across lib/.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codedError, refuse } from '../../lib/errors.mjs';

test('codedError builds (not throws) an Error with .code and .message set', () => {
  const err = codedError('SOME_CODE', 'something went wrong');
  assert.ok(err instanceof Error);
  assert.equal(err.code, 'SOME_CODE');
  assert.equal(err.message, 'something went wrong');
});

test('refuse always throws a codedError-shaped Error', () => {
  assert.throws(
    () => refuse('bad input', 'BAD_INPUT'),
    (err) => err instanceof Error && err.code === 'BAD_INPUT' && err.message === 'bad input',
  );
});
