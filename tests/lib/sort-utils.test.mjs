/**
 * Tests for lib/sort-utils.mjs — shared deterministic-sort comparators.
 *
 * Extracted during the 2026-08-16 codehealth duplicate-logic consolidation
 * pass: `compareByStringKeys` replaced identical inline comparators in
 * `lib/repomap/doc-references.mjs` and `lib/repomap/public-api-entries.mjs`;
 * `compareByCountDescThenKey` replaced identical inline comparators in
 * `lib/repomap/index.mjs` and `lib/retro/session-metrics.mjs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareByStringKeys, compareByCountDescThenKey } from '../../lib/sort-utils.mjs';

test('compareByStringKeys sorts by primary key ascending', () => {
  const rows = [{ a: 'b', b: '1' }, { a: 'a', b: '2' }];
  rows.sort(compareByStringKeys('a', 'b'));
  assert.deepEqual(rows.map((r) => r.a), ['a', 'b']);
});

test('compareByStringKeys breaks ties on the secondary key', () => {
  const rows = [{ a: 'x', b: '2' }, { a: 'x', b: '1' }];
  rows.sort(compareByStringKeys('a', 'b'));
  assert.deepEqual(rows.map((r) => r.b), ['1', '2']);
});

test('compareByCountDescThenKey sorts by count descending', () => {
  const rows = [{ tool: 'a', count: 1 }, { tool: 'b', count: 5 }];
  rows.sort(compareByCountDescThenKey('tool'));
  assert.deepEqual(rows.map((r) => r.tool), ['b', 'a']);
});

test('compareByCountDescThenKey breaks ties on the key ascending', () => {
  const rows = [{ tool: 'z', count: 3 }, { tool: 'a', count: 3 }];
  rows.sort(compareByCountDescThenKey('tool'));
  assert.deepEqual(rows.map((r) => r.tool), ['a', 'z']);
});
