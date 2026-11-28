import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount } from '../src/pagination.mjs';

test('pageCount rounds a partial page up', () => {
  assert.equal(pageCount(7, 5), 2);
});
