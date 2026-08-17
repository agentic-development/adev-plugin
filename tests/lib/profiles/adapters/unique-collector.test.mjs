/**
 * Tests for lib/profiles/adapters/unique-collector.mjs.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `createUniqueCollector` replaced an identical local `add(name)`
 * closure in `lib/profiles/adapters/claude-code.mjs` and
 * `lib/profiles/adapters/opencode.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createUniqueCollector } from '../../../../lib/profiles/adapters/unique-collector.mjs';

test('add() appends new names in first-seen order', () => {
  const { list, add } = createUniqueCollector();
  add('Read');
  add('Grep');
  assert.deepEqual(list, ['Read', 'Grep']);
});

test('add() silently ignores a repeated name', () => {
  const { list, add } = createUniqueCollector();
  add('Read');
  add('Read');
  add('Grep');
  assert.deepEqual(list, ['Read', 'Grep']);
});

test('each call to createUniqueCollector starts a fresh, independent list', () => {
  const first = createUniqueCollector();
  first.add('Read');
  const second = createUniqueCollector();
  assert.deepEqual(second.list, []);
});
