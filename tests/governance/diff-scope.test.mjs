/**
 * Tests for lib/governance/diff-scope.mjs — Task 10 of
 * review-block-auto-retry-rev-2-targeted-author-verify-loop.plan.md.
 *
 * `extractChangedSections(prevText, currText)` returns the current text of
 * every heading section whose content differs (or is new) between two spec
 * revisions. `expandWithCrossReferences(specText, changedAnchors)` adds any
 * section containing a markdown link or heading-name literal-text mention
 * targeting a changed anchor.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractChangedSections, expandWithCrossReferences } from '../../lib/governance/diff-scope.mjs';

test('extractChangedSections returns only sections whose text differs', () => {
  const prev = '## A\nold\n## B\nsame';
  const curr = '## A\nnew\n## B\nsame';
  const changed = extractChangedSections(prev, curr);
  assert.deepStrictEqual([...changed.keys()], ['a']);
});

test('extractChangedSections includes a section present in curr but absent from prev (new section)', () => {
  const prev = '## A\nsame';
  const curr = '## A\nsame\n## B\nbrand new';
  const changed = extractChangedSections(prev, curr);
  assert.deepStrictEqual([...changed.keys()], ['b']);
});

test('extractChangedSections returns an empty map when nothing differs', () => {
  const text = '## A\nsame\n## B\nalso same';
  const changed = extractChangedSections(text, text);
  assert.strictEqual(changed.size, 0);
});

test('extractChangedSections stores the CURRENT text of the changed section, not the prior text', () => {
  const prev = '## A\nold text';
  const curr = '## A\nnew text';
  const changed = extractChangedSections(prev, curr);
  assert.ok(changed.get('a').includes('new text'));
  assert.ok(!changed.get('a').includes('old text'));
});

test('expandWithCrossReferences includes a section that links to a changed anchor', () => {
  const spec = '## A\nnew\n## C\nsee [A](#a) for details';
  const expanded = expandWithCrossReferences(spec, new Set(['a']));
  assert.ok(expanded.has('c'));
});

test('expandWithCrossReferences includes a section with a literal heading-name mention of a changed anchor', () => {
  const spec = '## Behaviors\nnew\n## Notes\nSee the Behaviors section for details.';
  const expanded = expandWithCrossReferences(spec, new Set(['behaviors']));
  assert.ok(expanded.has('notes'));
});

test('expandWithCrossReferences does not add unrelated sections', () => {
  const spec = '## A\nnew\n## B\nunrelated content\n## C\nalso unrelated';
  const expanded = expandWithCrossReferences(spec, new Set(['a']));
  assert.ok(expanded.has('a'));
  assert.ok(!expanded.has('b'));
  assert.ok(!expanded.has('c'));
});

test('expandWithCrossReferences always includes the original changed anchors themselves', () => {
  const spec = '## A\nnew\n## B\nunrelated';
  const expanded = expandWithCrossReferences(spec, new Set(['a']));
  assert.ok(expanded.has('a'));
});
