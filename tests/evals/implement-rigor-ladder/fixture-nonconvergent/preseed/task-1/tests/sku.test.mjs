import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSku } from '../src/sku.mjs';
import { dispatch } from '../src/registry.mjs';

test('normalizeSku trims and uppercases', () => {
  assert.equal(normalizeSku('  ab-12 '), 'AB-12');
});

test('normalizeSku rejects an empty sku', () => {
  assert.throws(() => normalizeSku('   '), { code: 'SKU_INVALID' });
});

test('dispatch reaches normalizeSku under sku', () => {
  assert.equal(dispatch('sku', 'x1'), 'X1');
});
