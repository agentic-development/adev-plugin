import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../src/registry.mjs';

test('dispatch reaches the health handler', () => {
  assert.deepEqual(dispatch('health'), { status: 200, body: { ok: true } });
});

test('dispatch of an unregistered name is a 404', () => {
  assert.deepEqual(dispatch('nope'), { status: 404 });
});
