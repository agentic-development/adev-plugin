import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatch } from '../src/registry.mjs';

test('dispatch reaches a registered handler', () => {
  assert.deepEqual(dispatch('health'), { status: 200, body: { ok: true } });
});

test('dispatch of an unregistered name is 404', () => {
  assert.deepEqual(dispatch('nope'), { status: 404 });
});
