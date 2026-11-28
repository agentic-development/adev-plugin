import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, paginate } from '../src/pagination.mjs';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

test('pageCount is exact when total divides evenly', () => {
  assert.equal(pageCount(10, 5), 2);
});

test('pageCount of an empty collection is 0', () => {
  assert.equal(pageCount(0, 5), 0);
});

test('the page after the last page is empty', () => {
  assert.deepEqual(paginate(ITEMS, { page: 3, pageSize: 5 }), {
    items: [],
    page: 3,
    pageSize: 5,
    pageCount: 2,
    total: 10,
  });
});
