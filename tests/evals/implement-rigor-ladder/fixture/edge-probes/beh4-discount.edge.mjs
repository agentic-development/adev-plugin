import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load } from './load.mjs';

const mod = await load('../src/discount.mjs');
const NOW = 1_000;
const LIVE = 2_000;
const INVALID = { code: 'COUPON_INVALID' };

test('K1: a fixed coupon subtracts its amount in cents', () => {
  assert.equal(fn(mod, 'applyDiscount')(1000, { kind: 'fixed', amount: 250, expiresAt: LIVE }, NOW), 750);
});

test('K2: a percent coupon subtracts the floored share', () => {
  assert.equal(fn(mod, 'applyDiscount')(999, { kind: 'percent', amount: 10, expiresAt: LIVE }, NOW), 900);
});

test('K3: a percent coupon floors a non-integer share', () => {
  assert.equal(fn(mod, 'applyDiscount')(105, { kind: 'percent', amount: 33, expiresAt: LIVE }, NOW), 71);
});

test('K4: a coupon expiring exactly at now leaves the price unchanged', () => {
  assert.equal(fn(mod, 'applyDiscount')(1000, { kind: 'fixed', amount: 250, expiresAt: NOW }, NOW), 1000);
});

test('K5: an expired percent coupon leaves the price unchanged', () => {
  assert.equal(fn(mod, 'applyDiscount')(1000, { kind: 'percent', amount: 50, expiresAt: 500 }, NOW), 1000);
});

test('K6: a fixed coupon equal to the price yields 0', () => {
  assert.equal(fn(mod, 'applyDiscount')(300, { kind: 'fixed', amount: 300, expiresAt: LIVE }, NOW), 0);
});

test('K7: a percent coupon over 100 never goes below 0', () => {
  assert.equal(fn(mod, 'applyDiscount')(500, { kind: 'percent', amount: 150, expiresAt: LIVE }, NOW), 0);
});

test('K8: an unknown kind throws COUPON_INVALID', () => {
  assert.throws(() => fn(mod, 'applyDiscount')(1000, { kind: 'bogus', amount: 1, expiresAt: LIVE }, NOW), INVALID);
});

test('K9: a coupon with no kind throws COUPON_INVALID', () => {
  assert.throws(() => fn(mod, 'applyDiscount')(1000, { amount: 1, expiresAt: LIVE }, NOW), INVALID);
});

test('K10: the COUPON_INVALID throw is an Error', () => {
  const applyDiscount = fn(mod, 'applyDiscount');
  let thrown = null;
  try {
    applyDiscount(1000, { kind: 'bogus', amount: 1, expiresAt: LIVE }, NOW);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof Error, `threw ${String(thrown)}`);
});
