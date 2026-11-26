import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from '../src/discount.mjs';

test('a fixed coupon larger than the price yields 0, not the full price', () => {
  assert.equal(applyDiscount(300, { kind: 'fixed', amount: 500, expiresAt: 2_000 }, 1_000), 0);
});
