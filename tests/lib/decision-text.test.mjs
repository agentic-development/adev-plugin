import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_TEXT_BOUNDS, SINGLE_LINE_TRUNCATION_MARKER, truncateDecisionText,
  checkUnsafeDecisionText, processReviewerDecisionField, normalizeQuestion,
  deriveQuestion, neutralQuestion, headerFor,
} from '../../lib/decision-text.mjs';
import { buildBlockerId } from '../../lib/blocker-id.mjs';

const identity = { redact: (s) => s };
const ID = buildBlockerId({
  reviewer: 'consistency-analyzer', type: 'decision-needed',
  sectionAnchor: 'behaviors-added', findingText: 'Pick a cap.',
});
const MARK = '…[truncated]';

test('bounds are the spec values', () => {
  assert.deepEqual({ ...DECISION_TEXT_BOUNDS },
    { question: 500, label: 60, implications: 300, choice: 1000, note: 1000 });
  assert.equal(SINGLE_LINE_TRUNCATION_MARKER, MARK);
  assert.ok(Object.isFrozen(DECISION_TEXT_BOUNDS));
});

test('truncation counts code points and appends the single-line marker', () => {
  const out = truncateDecisionText('é'.repeat(501), DECISION_TEXT_BOUNDS.question);
  assert.equal([...out].length, 500 + [...MARK].length);
  assert.equal(out, 'é'.repeat(500) + MARK);
  assert.ok(!out.includes('\n'));
});

test('exactly at bound is untouched; bound+1 is truncated', () => {
  const at = 'a'.repeat(60);
  assert.equal(truncateDecisionText(at, 60), at);
  assert.equal(truncateDecisionText(at + 'b', 60), at + MARK);
});

test('astral-plane characters count as one code point', () => {
  const s = '😀'.repeat(60);
  assert.equal(s.length, 120);
  assert.equal(truncateDecisionText(s, 60), s);
  assert.equal(truncateDecisionText(s + '😀', 60), s + MARK);
});

test('empty string is untouched by truncation and passes the gate', () => {
  assert.equal(truncateDecisionText('', 60), '');
  assert.deepEqual(checkUnsafeDecisionText(''), { ok: true });
});

const bads = [
  ['newline', 'a\nb'], ['CR', 'a\rb'], ['NEL', 'a\u0085b'], ['bidi override', 'a‮b'],
  ['U+2028', 'a b'], ['U+2029', 'a b'], ['tab', 'a\tb'], ['ESC', 'a\x1bb'],
  ['zero-width joiner (Cf)', 'a‍b'],
  ['leading ---', '---x'], ['leading #', '# x'], ['backticks', 'a```b'],
  ['html open', 'a<!--b'], ['html close', 'a-->b'], ['bold', 'a**b'],
];
for (const [name, bad] of bads) {
  test(`gate refuses ${name}`, () => {
    const r = checkUnsafeDecisionText(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 0);
  });
}

test('gate: # and --- are only unsafe at the start', () => {
  for (const ok of ['a # b', 'a --- b', 'x#', 'use ``two`` ticks', 'a*b', 'a--b', 'ünïcode 😀']) {
    assert.deepEqual(checkUnsafeDecisionText(ok), { ok: true }, ok);
  }
  assert.equal(checkUnsafeDecisionText('--x').ok, true);
  assert.equal(checkUnsafeDecisionText('#').ok, false);
  assert.equal(checkUnsafeDecisionText('---').ok, false);
});

test('gate never throws on non-strings', () => {
  for (const v of [undefined, null, 42, {}, []]) {
    const r = checkUnsafeDecisionText(v);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
  }
});

test('processReviewerDecisionField: redact, then truncate, then gate', () => {
  const calls = [];
  const redact = (s) => { calls.push(s); return s.replace('SECRET', '[REDACTED]'); };
  const r = processReviewerDecisionField('use SECRET here', 'question', { redact });
  assert.deepEqual(r, { value: 'use [REDACTED] here' });
  assert.deepEqual(calls, ['use SECRET here']);
});

test('processReviewerDecisionField: gate runs on the truncated value', () => {
  // Offending `**` sits beyond the 60-cp bound, so it is cut away before the gate.
  const raw = 'a'.repeat(60) + '**tail';
  const r = processReviewerDecisionField(raw, 'label', identity);
  assert.deepEqual(r, { value: 'a'.repeat(60) + MARK });
  // Offending text inside the bound is refused.
  const bad = processReviewerDecisionField('a**' + 'a'.repeat(100), 'label', identity);
  assert.equal(typeof bad.rejected, 'string');
  assert.equal('value' in bad, false);
});

test('processReviewerDecisionField: per-field bounds', () => {
  for (const [field, bound] of [['question', 500], ['label', 60], ['implications', 300]]) {
    const r = processReviewerDecisionField('x'.repeat(bound + 1), field, identity);
    assert.equal(r.value, 'x'.repeat(bound) + MARK, field);
    const at = processReviewerDecisionField('x'.repeat(bound), field, identity);
    assert.equal(at.value, 'x'.repeat(bound), field);
  }
});

test('processReviewerDecisionField: redactor output that violates the gate is refused, not stripped', () => {
  const r = processReviewerDecisionField('fine', 'label', { redact: () => 'a\u0085b' });
  assert.equal(typeof r.rejected, 'string');
});

test('processReviewerDecisionField: non-string input is rejected', () => {
  assert.equal(typeof processReviewerDecisionField(undefined, 'label', identity).rejected, 'string');
});

test('a value BEH-2 accepts always passes the re-check', () => {
  const r = processReviewerDecisionField('x'.repeat(900), 'question', identity);
  assert.equal(checkUnsafeDecisionText(r.value).ok, true);
  assert.equal([...r.value].length, 500 + [...MARK].length);
});

test('neutralQuestion composes from a validated blocker id', () => {
  assert.equal(neutralQuestion(ID), `Which option resolves blocker ${ID}?`);
  assert.throws(() => neutralQuestion('bad id'), { code: 'INVALID_BLOCKER_ID' });
});

test('derived question uses the first sentence', () => {
  const r = deriveQuestion('Pick a cap for retries. More detail follows.', ID, identity);
  assert.equal(r.question, 'Pick a cap for retries.');
  assert.equal(r.fallback, null);
});

test('derived question without sentence terminator uses the whole prose', () => {
  assert.equal(deriveQuestion('Pick a cap', ID, identity).question, 'Pick a cap');
});

test('derived question falls back to the neutral question when the first sentence fails the gate', () => {
  const r = deriveQuestion('Use **bold** here. More.', ID, identity);
  assert.equal(r.question, `Which option resolves blocker ${ID}?`);
  assert.equal(r.fallback, 'neutral');
});

test('derived question falls back when prose is empty or not a string', () => {
  for (const p of ['', '   ', undefined, null]) {
    const r = deriveQuestion(p, ID, identity);
    assert.equal(r.question, `Which option resolves blocker ${ID}?`);
    assert.equal(r.fallback, 'neutral');
  }
});

test('derived question is redacted and truncated to 500 code points', () => {
  const r = deriveQuestion('y'.repeat(700), ID, identity);
  assert.equal(r.question, 'y'.repeat(500) + MARK);
  const red = deriveQuestion('Is SECRET ok?', ID, { redact: (s) => s.replace('SECRET', '[R]') });
  assert.equal(red.question, 'Is [R] ok?');
});

test('derived question with a multi-line first sentence falls back', () => {
  assert.equal(deriveQuestion('Line one\nline two.', ID, identity).fallback, 'neutral');
});

test('normalizeQuestion lowercases, collapses whitespace, trims', () => {
  assert.equal(normalizeQuestion('  Pick   A\tor B? '), 'pick a or b?');
  assert.equal(normalizeQuestion(''), '');
});

test('headerFor strips control/ANSI and caps at 12 code points', () => {
  assert.equal(headerFor('Behaviors Added \x1b[31m'), 'Behaviors Ad');
  assert.equal(headerFor('Short'), 'Short');
  assert.equal(headerFor('\x1b[31mAB\x07C\x1b[0m'), 'ABC');
  assert.equal(headerFor('😀'.repeat(13)), '😀'.repeat(12));
  assert.equal(headerFor('a'.repeat(12)), 'a'.repeat(12));
  assert.equal(headerFor(undefined), '');
});
