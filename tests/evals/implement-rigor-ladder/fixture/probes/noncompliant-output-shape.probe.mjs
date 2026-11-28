import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatItem } from '../src/format.mjs';

test('formatItem returns exactly the BEH-5 shape', () => {
  assert.deepEqual(formatItem({ id: 'a1', label: 'Blue Mug', priceCents: 1299 }, 'EUR'), {
    id: 'a1',
    label: 'Blue Mug',
    slug: 'blue-mug',
    price: { cents: 1299, currency: 'EUR' },
  });
});
