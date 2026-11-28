import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatItem } from '../src/format.mjs';

test('formatItem carries the id and label', () => {
  const out = formatItem({ id: 'a1', label: 'Blue Mug', priceCents: 1299 });
  assert.equal(out.id, 'a1');
  assert.equal(out.label, 'Blue Mug');
});
