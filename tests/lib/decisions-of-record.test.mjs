import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildBlockerId } from '../../lib/blocker-id.mjs';
import {
  findHeadingFenceAware,
  parseDecisionsOfRecord,
  composeEntry,
  applyDecisions,
  placeSection,
} from '../../lib/decisions-of-record.mjs';

const mk = (n) => buildBlockerId({
  reviewer: 'structural', type: 'gap', sectionAnchor: 'behavior', findingText: `finding ${n}`,
});
const A = mk('a');
const B = mk('b');
const C = mk('c');
const D = mk('d');

const marker = (n, ids) => `<!-- adev:decision DEC-${n} blockers=${ids.join(',')} -->`;
const bullet = (n, text) => `- **DEC-${n}** — ${text}`;

test('a ## Acceptance Criteria inside a ``` fence is ignored; the section goes before the real heading', () => {
  const body = [
    '# Spec', '', '## Behavior', '', '```md', '## Acceptance Criteria', '```', '',
    '## Acceptance Criteria', '', '1. x', '',
  ].join('\n');
  const found = findHeadingFenceAware(body, 2, 'Acceptance Criteria');
  assert.equal(body.slice(found.headingStart, found.headingStart + 25), '## Acceptance Criteria\n\n1');
  assert.equal(found.headingStart, body.lastIndexOf('## Acceptance Criteria'));
  assert.equal(found.end, body.length);

  const out = placeSection(body, 'ENTRY\n');
  assert.equal(out, [
    '# Spec', '', '## Behavior', '', '```md', '## Acceptance Criteria', '```', '',
    '## Decisions of Record', '', 'ENTRY', '',
    '## Acceptance Criteria', '', '1. x', '',
  ].join('\n'));
});

test('findHeadingFenceAware: ~~~ fences, longer closing fences, and end at next same-or-higher heading outside fences', () => {
  const body = ['## Decisions of Record', 'a', '~~~', '## Other', '~~~', '### Sub', '```', '## Fake', '`````', '## Next', 'z'].join('\n');
  const found = findHeadingFenceAware(body, 2, 'Decisions of Record');
  assert.equal(found.headingStart, 0);
  assert.equal(found.contentStart, '## Decisions of Record\n'.length);
  assert.equal(body.slice(found.end), '## Next\nz');
  assert.equal(findHeadingFenceAware(body, 2, 'Other'), null);
  assert.equal(findHeadingFenceAware(body, 2, 'Missing'), null);
});

test('absent Acceptance Criteria -> section appended at end of file', () => {
  assert.equal(placeSection('# Spec\n\ntext\n', 'E\n'), '# Spec\n\ntext\n\n## Decisions of Record\n\nE\n');
  assert.equal(placeSection('# Spec\n\ntext', 'E\n'), '# Spec\n\ntext\n\n## Decisions of Record\n\nE\n');
  assert.equal(placeSection('', 'E\n'), '## Decisions of Record\n\nE\n');
});

test('existing ## Decisions of Record content range is replaced; following sections untouched', () => {
  const body = '# S\n\n## Decisions of Record\n\nold\n\n## Acceptance Criteria\n\n1. x\n';
  assert.equal(
    placeSection(body, '\nnew\n'),
    '# S\n\n## Decisions of Record\n\nnew\n\n## Acceptance Criteria\n\n1. x\n',
  );
  const last = '# S\n\n## Decisions of Record\n\nold\n';
  assert.equal(placeSection(last, 'new'), '# S\n\n## Decisions of Record\n\nnew\n');
});

test('entry = marker line + exactly the next "- **DEC-<n>** — " line with the same n', () => {
  const text = [marker(1, [A]), bullet(1, 'q → **x**.'), marker(2, [B, C]), bullet(2, 'q2 → **y**.'), ''].join('\n');
  const r = parseDecisionsOfRecord(text);
  assert.deepEqual(r.entries.map((e) => [e.dec, e.blockerIds]), [['DEC-1', [A]], ['DEC-2', [B, C]]]);
  assert.equal(text.slice(r.entries[0].start, r.entries[0].end), [marker(1, [A]), bullet(1, 'q → **x**.')].join('\n'));
  assert.equal(r.maxDec, 2);
  assert.deepEqual(r.malformed, []);
  assert.deepEqual(r.advisories, []);
});

test('marker with an id parseBlockerId rejects -> DECISION_MARKER_MALFORMED, line preserved verbatim, absent from entries', () => {
  const badMarker = '<!-- adev:decision DEC-4 blockers=not-an-id -->';
  const text = [badMarker, bullet(4, 'q → **x**.'), marker(5, [A]), bullet(5, 'q → **y**.'), ''].join('\n');
  const r = parseDecisionsOfRecord(text);
  assert.deepEqual(r.entries.map((e) => e.dec), ['DEC-5']);
  assert.equal(r.malformed.length, 1);
  assert.equal(text.slice(r.malformed[0].start, r.malformed[0].end), badMarker);
  assert.deepEqual(r.advisories.map((a) => a.code), ['DECISION_MARKER_MALFORMED']);

  const out = applyDecisions(text, [{ blockerIds: [B], question: 'q', choice: 'c', implications: null, note: null }]);
  assert.ok(out.text.startsWith(`${badMarker}\n${bullet(4, 'q → **x**.')}\n`));
  assert.ok(out.advisories.some((a) => a.code === 'DECISION_MARKER_MALFORMED'));
});

test('malformed variants: unparseable marker, missing bullet, bullet with different n', () => {
  const unparseable = '<!-- adev:decision DEC-x blockers=' + A + ' -->';
  const noBullet = marker(2, [A]);
  const wrongN = marker(3, [A]);
  const text = [unparseable, 'prose', noBullet, 'prose', wrongN, bullet(9, 'q'), ''].join('\n');
  const r = parseDecisionsOfRecord(text);
  assert.equal(r.entries.length, 0);
  assert.equal(r.malformed.length, 3);
  assert.equal(r.advisories.length, 3);
  assert.ok(r.advisories.every((a) => a.code === 'DECISION_MARKER_MALFORMED'));
});

test('DEC-<n> allocation = highest present + 1, malformed marker lines included', () => {
  const text = [marker(1, [A]), bullet(1, 'q → **x**.'), '<!-- adev:decision DEC-7 blockers=bogus -->', ''].join('\n');
  assert.equal(parseDecisionsOfRecord(text).maxDec, 7);
  const out = applyDecisions(text, [{ blockerIds: [B], question: 'q', choice: 'c', implications: null, note: null }]);
  assert.deepEqual(out.written, [{ dec: 'DEC-8', blockerIds: [B] }]);
  assert.ok(out.text.endsWith(`${marker(8, [B])}\n${bullet(8, 'q → **c**.')}\n`));
  assert.equal(parseDecisionsOfRecord('').maxDec, 0);
});

test('applyDecisions on an empty section creates DEC-1 and sequences several decisions', () => {
  const out = applyDecisions('', [
    { blockerIds: [A], question: 'qa', choice: 'x', implications: null, note: null },
    { blockerIds: [B, C], question: 'qb', choice: 'y', implications: null, note: null },
  ]);
  assert.equal(out.text, [
    marker(1, [A]), bullet(1, 'qa → **x**.'), marker(2, [B, C]), bullet(2, 'qb → **y**.'), '',
  ].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-1', blockerIds: [A] }, { dec: 'DEC-2', blockerIds: [B, C] }]);
});

test('re-deciding all ids of an entry replaces it in place and keeps DEC-<n>; other entries byte-identical', () => {
  const e1 = [marker(1, [A]), bullet(1, 'q1 → **x**.')].join('\n');
  const e2 = [marker(2, [B]), bullet(2, 'q2 → **y**. impl.')].join('\n');
  const e3 = [marker(3, [C]), bullet(3, 'q3 → **z**.')].join('\n');
  const text = `intro prose\n${e1}\n${e2}\n${e3}\n\n`;
  const out = applyDecisions(text, [{ blockerIds: [B], question: 'q2b', choice: 'w', implications: null, note: 'n' }]);
  assert.equal(out.text, `intro prose\n${e1}\n${marker(2, [B])}\n${bullet(2, 'q2b → **w**. n.')}\n${e3}\n\n`);
  assert.deepEqual(out.written, [{ dec: 'DEC-2', blockerIds: [B] }]);
});

test('re-deciding one id of a multi-blocker entry: old bullet byte-identical, marker drops the id, new DEC-<n> appended (BD-3)', () => {
  const oldBullet = bullet(1, 'q1 → **x**.');
  const e2 = [marker(2, [D]), bullet(2, 'q2 → **y**.')].join('\n');
  const text = [marker(1, [A, B]), oldBullet, e2, ''].join('\n');
  const out = applyDecisions(text, [{ blockerIds: [B], question: 'q1', choice: 'other', implications: null, note: null }]);
  assert.equal(out.text, [
    marker(1, [A]), oldBullet, e2, marker(3, [B]), bullet(3, 'q1 → **other**.'), '',
  ].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-3', blockerIds: [B] }]);
});

test('a malformed entry is never replaced even when its marker names a re-decided id', () => {
  const malformedMarker = marker(1, [A]);
  const text = [malformedMarker, 'not a bullet', ''].join('\n');
  const out = applyDecisions(text, [{ blockerIds: [A], question: 'q', choice: 'c', implications: null, note: null }]);
  assert.equal(out.text, [malformedMarker, 'not a bullet', marker(2, [A]), bullet(2, 'q → **c**.'), ''].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-2', blockerIds: [A] }]);
  assert.ok(out.advisories.some((a) => a.code === 'DECISION_MARKER_MALFORMED'));
});

test('composeEntry: "- **DEC-n** — <q> → **<choice>**. <implications>. <note>" with implications only when choice matches a label', () => {
  assert.equal(
    composeEntry({ dec: 3, blockerIds: [A, B], question: 'Which store?', choice: 'sqlite', implications: 'Adds a native dep', note: 'ops agreed' }),
    `${marker(3, [A, B])}\n- **DEC-3** — Which store? → **sqlite**. Adds a native dep. ops agreed.`,
  );
  assert.equal(
    composeEntry({ dec: 'DEC-4', blockerIds: [A], question: 'Q', choice: 'free text', implications: null, note: 'because' }),
    `${marker(4, [A])}\n- **DEC-4** — Q → **free text**. because.`,
  );
  assert.equal(
    composeEntry({ dec: 5, blockerIds: [A], question: 'Q', choice: 'c', implications: null, note: null }),
    `${marker(5, [A])}\n- **DEC-5** — Q → **c**.`,
  );
});

test('composeEntry never doubles terminal punctuation on implications or note', () => {
  assert.equal(
    composeEntry({ dec: 1, blockerIds: [A], question: 'Q?', choice: 'c', implications: 'Costs more.', note: 'Really!' }),
    `${marker(1, [A])}\n- **DEC-1** — Q? → **c**. Costs more. Really!`,
  );
});

test('a decision fully covering two entries replaces both in place; each keeps its DEC and own ids', () => {
  const e3 = [marker(3, [C]), bullet(3, 'q3 → **z**.')].join('\n');
  const text = [marker(1, [A]), bullet(1, 'q1 → **x**.'), marker(2, [B]), bullet(2, 'q2 → **y**.'), e3, ''].join('\n');
  const out = applyDecisions(text, [{ blockerIds: [A, B], question: 'Q', choice: 'new', implications: null, note: null }]);
  assert.equal(out.text, [
    marker(1, [A]), bullet(1, 'Q → **new**.'), marker(2, [B]), bullet(2, 'Q → **new**.'), e3, '',
  ].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-1', blockerIds: [A] }, { dec: 'DEC-2', blockerIds: [B] }]);
});

test('ids of the decision not named by any fully-covered entry are added to the first fully-covered entry', () => {
  const text = [marker(1, [A]), bullet(1, 'q1 → **x**.'), ''].join('\n');
  const out = applyDecisions(text, [{ blockerIds: [A, C], question: 'Q', choice: 'new', implications: null, note: null }]);
  assert.equal(out.text, [marker(1, [A, C]), bullet(1, 'Q → **new**.'), ''].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-1', blockerIds: [A, C] }]);
});

test('partial entry drops covered ids; full entry keeps own ids first then added ids in decision order', () => {
  const partialBullet = bullet(1, 'q1 → **x**.');
  const text = [marker(1, [A, B]), partialBullet, marker(2, [C]), bullet(2, 'q2 → **y**.'), ''].join('\n');
  const out = applyDecisions(text, [{ blockerIds: [B, C], question: 'Q', choice: 'new', implications: null, note: null }]);
  assert.equal(out.text, [
    marker(1, [A]), partialBullet, marker(2, [C, B]), bullet(2, 'Q → **new**.'), '',
  ].join('\n'));
  assert.deepEqual(out.written, [{ dec: 'DEC-2', blockerIds: [C, B] }]);
});
