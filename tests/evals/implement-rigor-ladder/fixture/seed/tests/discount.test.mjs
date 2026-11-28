import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from '../src/discount.mjs';

const NOW = 1_000;

test('a fixed coupon subtracts its amount', () => {
  assert.equal(applyDiscount(2000, { kind: 'fixed', amount: 500, expiresAt: 2_000 }, NOW), 1500);
});

test('an expired coupon leaves the price unchanged', () => {
  assert.equal(applyDiscount(2000, { kind: 'fixed', amount: 500, expiresAt: 500 }, NOW), 2000);
});
