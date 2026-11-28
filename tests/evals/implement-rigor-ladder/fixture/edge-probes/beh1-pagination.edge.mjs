import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fn, load } from './load.mjs';

const mod = await load('../src/pagination.mjs');
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('P1: pageCount(10, 5) is 2', () => {
  assert.equal(fn(mod, 'pageCount')(10, 5), 2);
});

test('P2: pageCount(0, 5) is 0', () => {
  assert.equal(fn(mod, 'pageCount')(0, 5), 0);
});

test('P3: a fractional page is outside 1..pageCount and returns no items', () => {
  assert.deepEqual(fn(mod, 'paginate')(LETTERS, { page: 1.5, pageSize: 3 }).items, []);
});

test('P4: a string page is outside 1..pageCount and returns no items', () => {
  assert.deepEqual(fn(mod, 'paginate')(LETTERS, { page: '2', pageSize: 3 }).items, []);
});

test('P5: the page after the only full page returns no items', () => {
  assert.deepEqual(fn(mod, 'paginate')(['a', 'b', 'c'], { page: 3, pageSize: 3 }).items, []);
});

test('P6: paginate without options does not throw', () => {
  const paginate = fn(mod, 'paginate');
  assert.doesNotThrow(() => paginate(['a', 'b']));
});

test('P7: page 2 of size 3 holds the fourth to sixth items', () => {
  assert.deepEqual(fn(mod, 'paginate')(LETTERS, { page: 2, pageSize: 3 }).items, ['d', 'e', 'f']);
});
