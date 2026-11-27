import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load, value } from './load.mjs';

const list = await load('../src/handlers/list.mjs');
const registry = await load('../src/registry.mjs');

const ITEMS = [
  { id: 'a', label: 'Blue Mug', priceCents: 1299 },
  { id: 'b', label: 'Red Cup', priceCents: 500 },
  { id: 'c', label: 'Tea Pot', priceCents: 2500 },
];
const formatted = (item, currency) => ({
  id: item.id,
  label: item.label,
  slug: item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  price: { cents: item.priceCents, currency },
});

test('L1: page 1 answers 200 with its formatted items, page, pageCount and total', () => {
  const out = fn(list, 'listHandler')({ page: 1, pageSize: 2 }, { items: ITEMS, currency: 'EUR' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.items, ITEMS.slice(0, 2).map((i) => formatted(i, 'EUR')));
  assert.equal(out.body.page, 1);
  assert.equal(out.body.pageCount, 2);
  assert.equal(out.body.total, 3);
});

test('L2: the last partial page holds the remaining item', () => {
  const out = fn(list, 'listHandler')({ page: 2, pageSize: 2 }, { items: ITEMS, currency: 'EUR' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.items, [formatted(ITEMS[2], 'EUR')]);
  assert.equal(out.body.page, 2);
});

test('L3: a page past the last answers 200 with no items and the real counts', () => {
  const handler = fn(list, 'listHandler');
  let out;
  assert.doesNotThrow(() => {
    out = handler({ page: 5, pageSize: 2 }, { items: ITEMS, currency: 'EUR' });
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.items, []);
  assert.equal(out.body.pageCount, 2);
  assert.equal(out.body.total, 3);
});

test('L4: an empty catalog answers 200 with no items, pageCount 0 and total 0', () => {
  const out = fn(list, 'listHandler')({ page: 1, pageSize: 5 }, { items: [], currency: 'USD' });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.items, []);
  assert.equal(out.body.pageCount, 0);
  assert.equal(out.body.total, 0);
});

test('L5: items are formatted in the currency passed to the handler', () => {
  const out = fn(list, 'listHandler')({ page: 1, pageSize: 3 }, { items: ITEMS, currency: 'JPY' });
  assert.deepEqual(out.body.items.map((i) => i.price.currency), ['JPY', 'JPY', 'JPY']);
  assert.deepEqual(out.body.items.map((i) => i.slug), ['blue-mug', 'red-cup', 'tea-pot']);
});

test('L6: the body has exactly items, page, pageCount and total', () => {
  const out = fn(list, 'listHandler')({ page: 1, pageSize: 2 }, { items: ITEMS, currency: 'EUR' });
  assert.deepEqual(Object.keys(out).sort(), ['body', 'status']);
  assert.deepEqual(Object.keys(out.body).sort(), ['items', 'page', 'pageCount', 'total']);
});

test('L7: dispatch("list", ...) reaches listHandler', () => {
  const args = [{ page: 2, pageSize: 2 }, { items: ITEMS, currency: 'EUR' }];
  assert.deepEqual(fn(registry, 'dispatch')('list', ...args), fn(list, 'listHandler')(...args));
});

test('L8: the list handler is registered in the handlers map', () => {
  assert.equal(typeof value(registry, 'handlers').list, 'function');
});

test('L9: dispatch of an unregistered name answers exactly { status: 404 }', () => {
  assert.deepEqual(fn(registry, 'dispatch')('missing', {}, {}), { status: 404 });
});

test('L10: inherited object keys are not registered handlers', () => {
  const dispatch = fn(registry, 'dispatch');
  for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    let out;
    assert.doesNotThrow(() => {
      out = dispatch(name, {}, {});
    }, name);
    assert.deepEqual(out, { status: 404 }, name);
  }
});
