import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSku } from '../src/sku.mjs';
import { dispatch } from '../src/registry.mjs';

test('normalizeSku trims and uppercases', () => {
  assert.equal(normalizeSku('  ab-12 '), 'AB-12');
});

test('normalizeSku returns the SKU_INVALID error value for an empty sku', () => {
  assert.deepEqual(normalizeSku('   '), { error: { code: 'SKU_INVALID' } });
});

test('dispatch reaches normalizeSku under sku', () => {
  assert.equal(dispatch('sku', 'x1'), 'X1');
});
