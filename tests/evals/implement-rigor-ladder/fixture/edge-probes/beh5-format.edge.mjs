import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load } from './load.mjs';

const mod = await load('../src/format.mjs');

test('F1: the BEH-5 shape holds for an accented label and a zero price', () => {
  assert.deepEqual(fn(mod, 'formatItem')({ id: 'x', label: 'Café Crème', priceCents: 0 }, 'USD'), {
    id: 'x',
    label: 'Café Crème',
    slug: 'caf-cr-me',
    price: { cents: 0, currency: 'USD' },
  });
});

test('F2: extra input keys do not reach the output', () => {
  const out = fn(mod, 'formatItem')({ id: 'a', label: 'A', priceCents: 1, stock: 5, currency: 'GBP' }, 'JPY');
  assert.deepEqual(Object.keys(out).sort(), ['id', 'label', 'price', 'slug']);
});

test('F3: price has exactly cents and currency', () => {
  const out = fn(mod, 'formatItem')({ id: 'a', label: 'A', priceCents: 1 }, 'JPY');
  assert.deepEqual(Object.keys(out.price).sort(), ['cents', 'currency']);
});

test('F4: the currency comes from the argument, not the item', () => {
  const out = fn(mod, 'formatItem')({ id: 'a', label: 'A', priceCents: 1, currency: 'GBP' }, 'JPY');
  assert.equal(out.price.currency, 'JPY');
});

test('F5: the slug follows slugify for a label with edge separators', () => {
  assert.equal(fn(mod, 'formatItem')({ id: 'a', label: '--Hi!--', priceCents: 1 }, 'USD').slug, 'hi');
});
