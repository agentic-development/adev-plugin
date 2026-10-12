import { test } from 'node:test';
import assert from 'node:assert/strict';

import { slugifyHeading, listSections, resolveSectionAnchors, isNestedRange } from '../../lib/section-anchors.mjs';

test('slugifyHeading lowercases, drops punctuation and collapses separators', () => {
  assert.equal(slugifyHeading('Error Cases: table'), 'error-cases-table');
  assert.equal(slugifyHeading('  A -- B  '), 'a-b');
  assert.equal(slugifyHeading('***'), '');
});

test('a parent section range contains its sub-sections and ends at the next same-level heading', () => {
  const body = '## A\n\na\n\n### A1\n\nx\n\n## B\n\nb\n';
  const ranges = resolveSectionAnchors(body);
  const a = ranges.get('a');
  const a1 = ranges.get('a1');
  assert.ok(isNestedRange(a1, a));
  assert.ok(!isNestedRange(a, a1));
  assert.equal(body.slice(a.end).startsWith('## B'), true);
});

test('the first heading with a duplicate slug wins', () => {
  const body = '## Notes\n\nfirst\n\n## Notes\n\nsecond\n';
  const r = resolveSectionAnchors(body).get('notes');
  assert.ok(body.slice(r.start, r.end).includes('first'));
});

test('listSections reports heading offsets in document order', () => {
  const body = '# T\n\n## A\n\n## B\n';
  assert.deepStrictEqual(listSections(body).map(s => [s.level, s.anchor, body.slice(s.headingStart, s.headingStart + 2)]), [
    [1, 't', '# '], [2, 'a', '##'], [2, 'b', '##'],
  ]);
});
