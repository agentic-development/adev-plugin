import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { createTempDir, cleanupTempDir, writeFixture, captureThrow } from '../helpers.mjs';
import { resolveDecisionPaths, computePending, recordDecisions, readAnswersInput, ASK_ROUND_GROUP_LIMIT } from '../../lib/decisions.mjs';
import { writeBlockers, sidecarPathForSpec } from '../../lib/blockers-writer.mjs';

const SPEC = '.context-index/specs/cross-cutting/s.spec.md';
const SPEC_TEXT = [
  '---', 'revision: 3', 'status: review-pending', '---', '# S', '',
  '## Alpha', 'a', '', '## Beta Section Heading Long', 'b', '',
  '## Decisions of Record', '',
  '<!-- adev:decision DEC-1 blockers=r:t:00000001 -->',
  '- **DEC-1** — Q → **A**.',
  '<!-- adev:decision DEC-2 blockers=bad -->', 'no bullet', '',
  '## Acceptance Criteria', 'x', '',
].join('\n');

const OPTS = [{ label: 'A', implications: 'ia' }, { label: 'B', implications: 'ib' }];
const hex = (n) => `r:t:${String(n).padStart(8, '0')}`;
const dec = (id, anchor, extra = {}) => ({
  blocker_id: id, section_anchor: anchor, reviewer: 'r', finding_class: 'decision',
  prose: 'Pick one. More text.', ...extra,
});

function seed(findings, { spec = SPEC_TEXT, revision = 3 } = {}) {
  const root = createTempDir();
  writeFixture(root, SPEC, spec);
  if (findings) writeBlockers(root, SPEC, findings, { revision });
  return root;
}
const sidecarText = (root) => readFileSync(join(root, sidecarPathForSpec(SPEC)), 'utf8');

test('spec outside .context-index/specs/ or not *.spec.md -> INVALID_SPEC_PATH, message names path only', () => {
  const root = seed(null);
  try {
    writeFixture(root, 'docs/x.spec.md', 'SECRET-CONTENT');
    writeFixture(root, '.context-index/specs/y.md', 'SECRET-CONTENT');
    for (const p of ['docs/x.spec.md', '.context-index/specs/y.md', '../escape.spec.md', '.context-index/specs/missing.spec.md']) {
      const e = captureThrow(() => resolveDecisionPaths(root, p));
      assert.equal(e.code, 'INVALID_SPEC_PATH', p);
      assert.ok(!e.message.includes('SECRET-CONTENT'));
    }
  } finally { cleanupTempDir(root); }
});

test('spec symlink resolving outside root -> INVALID_SPEC_PATH', () => {
  const root = seed(null);
  const outside = createTempDir();
  try {
    writeFixture(outside, 'o.spec.md', 'OUTSIDE');
    symlinkSync(join(outside, 'o.spec.md'), join(root, '.context-index/specs/link.spec.md'));
    const e = captureThrow(() => resolveDecisionPaths(root, '.context-index/specs/link.spec.md'));
    assert.equal(e.code, 'INVALID_SPEC_PATH');
    assert.ok(!e.message.includes('OUTSIDE'));
  } finally { cleanupTempDir(root); cleanupTempDir(outside); }
});

test('absent sidecar: resolves with sidecarExists false and pending still works', () => {
  const root = seed(null);
  try {
    const r = resolveDecisionPaths(root, SPEC);
    assert.equal(r.sidecarExists, false);
    assert.equal(r.relSpec, SPEC);
    assert.ok(r.absSidecar.endsWith('/.context-index/specs/cross-cutting/s.blockers.md'));
    const p = computePending(root, SPEC);
    assert.deepEqual(p.pending, []);
    assert.deepEqual(p.answered, []);
    assert.deepEqual(p.decided.map((d) => d.dec), ['DEC-1']);
  } finally { cleanupTempDir(root); }
});

test('dangling sidecar symlink -> INVALID_SPEC_PATH on record', () => {
  const root = seed(null);
  try {
    symlinkSync(join(root, 'nowhere.md'), join(root, sidecarPathForSpec(SPEC)));
    const e = captureThrow(() => recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'A' }]));
    assert.equal(e.code, 'INVALID_SPEC_PATH');
  } finally { cleanupTempDir(root); }
});

test('sidecar symlink escaping root -> INVALID_SPEC_PATH', () => {
  const root = seed(null);
  const outside = createTempDir();
  try {
    writeFixture(outside, 'o.md', 'x');
    symlinkSync(join(outside, 'o.md'), join(root, sidecarPathForSpec(SPEC)));
    assert.equal(captureThrow(() => resolveDecisionPaths(root, SPEC)).code, 'INVALID_SPEC_PATH');
  } finally { cleanupTempDir(root); cleanupTempDir(outside); }
});

test('pending lists only unanswered decisions ordered by heading position then blocker_id; unresolvable anchors last', () => {
  const root = seed([
    dec(hex(5), 'beta-section-heading-long', { options: OPTS, question: 'Q5?' }),
    dec(hex(4), 'nonexistent-anchor', { options: OPTS, question: 'Q4?' }),
    dec(hex(3), 'alpha', { options: OPTS, question: 'Q3?' }),
    dec(hex(2), 'alpha', { options: OPTS, question: 'Q2?' }),
    { blocker_id: hex(9), section_anchor: 'alpha', reviewer: 'r', prose: 'defect.' },
  ]);
  try {
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(2)], choice: 'A' }]);
    const p = computePending(root, SPEC);
    assert.deepEqual(p.pending.map((x) => x.blocker_id), [hex(3), hex(5), hex(4)]);
    assert.deepEqual(p.answered.map((x) => x.blocker_id), [hex(2)]);
    assert.equal(p.spec, SPEC);
    assert.deepEqual(Object.keys(p.pending[0]).sort(), ['ask', 'blocker_id', 'header', 'options', 'question', 'section_anchor', 'structured']);
  } finally { cleanupTempDir(root); }
});

test('structured is true exactly when options has 2-4 entries; header <= 12 code points', () => {
  const four = ['A', 'B', 'C', 'D'].map((l) => ({ label: l, implications: 'i' }));
  const root = seed([
    dec(hex(1), 'alpha', { options: OPTS, question: 'Q1?' }),
    dec(hex(2), 'beta-section-heading-long', { options: four, question: 'Q2?' }),
    dec(hex(3), 'alpha', { question: 'Q3?' }),
  ]);
  try {
    const p = computePending(root, SPEC);
    const by = Object.fromEntries(p.pending.map((x) => [x.blocker_id, x]));
    assert.equal(by[hex(1)].structured, true);
    assert.equal(by[hex(2)].structured, true);
    assert.equal(by[hex(3)].structured, false);
    assert.deepEqual(by[hex(3)].options, []);
    assert.equal(by[hex(2)].header, 'Beta Section');
    assert.equal(by[hex(1)].header, 'Alpha');
  } finally { cleanupTempDir(root); }
});

test('missing question -> derived with QUESTION_DERIVED; unsafe first sentence -> neutral question', () => {
  const root = seed([
    dec(hex(1), 'alpha', { prose: 'Choose the cap. Then more.' }),
    dec(hex(2), 'alpha', { prose: '# heading first. More.' }),
  ]);
  try {
    const p = computePending(root, SPEC);
    assert.equal(p.pending[0].question, 'Choose the cap.');
    assert.equal(p.pending[1].question, `Which option resolves blocker ${hex(2)}?`);
    const derived = p.advisories.filter((a) => a.code === 'QUESTION_DERIVED').map((a) => a.blocker_id);
    assert.deepEqual(derived, [hex(1), hex(2)]);
  } finally { cleanupTempDir(root); }
});

test('stored value failing the gate is treated as absent with DECISION_TEXT_REJECTED', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Fine?', options: OPTS })]);
  try {
    const sp = join(root, sidecarPathForSpec(SPEC));
    let t = readFileSync(sp, 'utf8');
    t = t.replace('question: "Fine?"', 'question: "bad ``` fence?"').replace('"label":"A"', '"label":"A**"');
    writeFileSync(sp, t);
    const p = computePending(root, SPEC);
    assert.equal(p.pending[0].question, 'Pick one.');
    assert.deepEqual(p.pending[0].options, []);
    const rej = p.advisories.filter((a) => a.code === 'DECISION_TEXT_REJECTED').map((a) => a.field);
    assert.deepEqual(rej, ['question', 'options']);
    assert.ok(p.advisories.some((a) => a.code === 'QUESTION_DERIVED'));
  } finally { cleanupTempDir(root); }
});

test('identical normalized questions in one section -> later entries duplicate_of the first; different section or text -> no mark', () => {
  const root = seed([
    dec(hex(1), 'alpha', { question: 'Same  Q?' }),
    dec(hex(2), 'alpha', { question: 'same q?' }),
    dec(hex(3), 'alpha', { question: 'Other?' }),
    dec(hex(4), 'beta-section-heading-long', { question: 'Same Q?' }),
  ]);
  try {
    const p = computePending(root, SPEC);
    const by = Object.fromEntries(p.pending.map((x) => [x.blocker_id, x]));
    assert.equal(by[hex(1)].duplicate_of, undefined);
    assert.equal(by[hex(2)].duplicate_of, hex(1));
    assert.equal(by[hex(3)].duplicate_of, undefined);
    assert.equal(by[hex(4)].duplicate_of, undefined);
  } finally { cleanupTempDir(root); }
});

test('answered lists choice/note/recorded with no DEC-<n>; decided read from the spec section; malformed marker advisory', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q?' })]);
  try {
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'A', note: 'because' }], { now: () => '2026-01-02T03:04:05.000Z' });
    const p = computePending(root, SPEC);
    assert.deepEqual(p.answered, [{
      blocker_id: hex(1), section_anchor: 'alpha', decision_choice: 'A', decision_note: 'because',
      decision_recorded: '2026-01-02T03:04:05.000Z',
    }]);
    assert.deepEqual(p.decided, [{ dec: 'DEC-1', blocker_ids: [hex(1)] }]);
    assert.equal(p.advisories.filter((a) => a.code === 'DECISION_MARKER_MALFORMED').length, 1);
  } finally { cleanupTempDir(root); }
});

test('more than 16 groups -> first 16 ask:true, rest ask:false, ask_round reports overflow', () => {
  const findings = [];
  for (let i = 1; i <= 18; i++) findings.push(dec(hex(i), 'alpha', { question: `Question ${i}?` }));
  findings.push(dec(hex(19), 'alpha', { question: 'Question 1?' }));
  const root = seed(findings);
  try {
    const p = computePending(root, SPEC);
    assert.equal(ASK_ROUND_GROUP_LIMIT, 16);
    assert.equal(p.pending.length, 19);
    assert.deepEqual(p.ask_round, { limit: 16, asked: 16, overflow: 2 });
    const by = Object.fromEntries(p.pending.map((x) => [x.blocker_id, x]));
    assert.equal(by[hex(16)].ask, true);
    assert.equal(by[hex(17)].ask, false);
    assert.equal(by[hex(18)].ask, false);
    assert.equal(by[hex(19)].duplicate_of, hex(1));
    assert.equal(by[hex(19)].ask, true);
  } finally { cleanupTempDir(root); }
});

test('record writes only the named entries answer keys; spec byte-identical; other sidecar bytes unchanged', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q1?' }), dec(hex(2), 'alpha', { question: 'Q2?' })]);
  try {
    const specBefore = readFileSync(join(root, SPEC), 'utf8');
    const before = sidecarText(root);
    const r = recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'A', note: 'n' }], { now: () => 'T0' });
    assert.deepEqual(r.recorded, [hex(1)]);
    assert.equal(readFileSync(join(root, SPEC), 'utf8'), specBefore);
    const after = sidecarText(root);
    assert.equal(after.replace(/decision_choice: "A"\ndecision_note: "n"\ndecision_recorded: T0\n/, ''), before);
    assert.ok(after.includes('decision_choice: "A"\ndecision_note: "n"\ndecision_recorded: T0'));
    assert.ok(!existsSync(`${join(root, sidecarPathForSpec(SPEC))}.tmp`));
    // re-record without note removes decision_note
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'B' }], { now: () => 'T1' });
    const again = sidecarText(root);
    assert.ok(again.includes('decision_choice: "B"\ndecision_recorded: T1'));
    assert.ok(!again.includes('decision_note'));
    assert.equal((again.match(/decision_choice/g) ?? []).length, 1);
  } finally { cleanupTempDir(root); }
});

test('record fans one answer over several blocker_ids', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q1?' }), dec(hex(2), 'alpha', { question: 'Q1?' })]);
  try {
    const r = recordDecisions(root, SPEC, [{ blocker_ids: [hex(1), hex(2)], choice: 'A' }]);
    assert.deepEqual(r.recorded, [hex(1), hex(2)]);
    assert.equal((sidecarText(root).match(/decision_choice: "A"/g) ?? []).length, 2);
  } finally { cleanupTempDir(root); }
});

test('record applies _redactForBlockers to choice/note before storage', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q?' })]);
  try {
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'use password=hunter2 now', note: 'api_key: abc123' }]);
    const t = sidecarText(root);
    assert.ok(!t.includes('hunter2'));
    assert.ok(!t.includes('abc123'));
    assert.ok(t.includes('[REDACTED]'));
  } finally { cleanupTempDir(root); }
});

test('record rejects UNKNOWN_DECISION_BLOCKER / NOT_A_DECISION_BLOCKER / BLOCKERS_REVISION_MISMATCH / INVALID_DECISION_ANSWERS / NO_REVIEW_SIDECARS, writing nothing', () => {
  const root = seed([
    dec(hex(1), 'alpha', { question: 'Q?' }),
    { blocker_id: hex(9), section_anchor: 'alpha', reviewer: 'r', prose: 'defect.' },
  ]);
  try {
    const before = sidecarText(root);
    const code = (answers) => captureThrow(() => recordDecisions(root, SPEC, answers)).code;
    assert.equal(code([{ blocker_ids: ['r:t:ffffffff'], choice: 'A' }]), 'UNKNOWN_DECISION_BLOCKER');
    assert.equal(code([{ blocker_ids: [hex(9)], choice: 'A' }]), 'NOT_A_DECISION_BLOCKER');
    assert.equal(code([{ blocker_ids: [], choice: 'A' }]), 'INVALID_DECISION_ANSWERS');
    assert.equal(code([{ blocker_ids: [hex(1)], choice: '' }]), 'INVALID_DECISION_ANSWERS');
    assert.equal(code('nope'), 'INVALID_DECISION_ANSWERS');
    assert.equal(code([{ blocker_ids: [hex(1)], choice: 'A', note: 5 }]), 'INVALID_DECISION_ANSWERS');
    assert.equal(sidecarText(root), before);
    writeFixture(root, SPEC, SPEC_TEXT.replace('revision: 3', 'revision: 4'));
    assert.equal(code([{ blocker_ids: [hex(1)], choice: 'A' }]), 'BLOCKERS_REVISION_MISMATCH');
    assert.equal(sidecarText(root), before);
    unlinkSync(join(root, sidecarPathForSpec(SPEC)));
    writeFixture(root, '.context-index/specs/cross-cutting/other.review.md', 'x');
    assert.equal(code([{ blocker_ids: [hex(1)], choice: 'A' }]), 'NO_REVIEW_SIDECARS');
  } finally { cleanupTempDir(root); }
});

test('choice or note over 1000 chars or failing the gate -> UNSAFE_DECISION_TEXT, nothing written (refused, not truncated)', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q?' })]);
  try {
    const before = sidecarText(root);
    for (const a of [
      { blocker_ids: [hex(1)], choice: 'x'.repeat(1001) },
      { blocker_ids: [hex(1)], choice: 'ok', note: 'y'.repeat(1001) },
      { blocker_ids: [hex(1)], choice: 'a\nb' },
      { blocker_ids: [hex(1)], choice: 'ok', note: '```x' },
    ]) {
      assert.equal(captureThrow(() => recordDecisions(root, SPEC, [a])).code, 'UNSAFE_DECISION_TEXT');
    }
    assert.equal(sidecarText(root), before);
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'x'.repeat(1000) }]);
  } finally { cleanupTempDir(root); }
});

test('all-or-nothing: one bad answer in the array -> no answer written', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q1?' }), dec(hex(2), 'alpha', { question: 'Q2?' })]);
  try {
    const before = sidecarText(root);
    const e = captureThrow(() => recordDecisions(root, SPEC, [
      { blocker_ids: [hex(1)], choice: 'A' },
      { blocker_ids: [hex(2)], choice: 'bad\nchoice' },
    ]));
    assert.equal(e.code, 'UNSAFE_DECISION_TEXT');
    assert.equal(sidecarText(root), before);
  } finally { cleanupTempDir(root); }
});

test('--answers input over 64 KiB, or @path outside the root -> INVALID_DECISION_ANSWERS, no file content echoed', () => {
  const root = seed(null);
  const outside = createTempDir();
  try {
    const big = JSON.stringify([{ blocker_ids: ['a'], choice: 'x'.repeat(70000) }]);
    assert.equal(captureThrow(() => readAnswersInput(root, big)).code, 'INVALID_DECISION_ANSWERS');
    writeFixture(root, 'big.json', big);
    assert.equal(captureThrow(() => readAnswersInput(root, '@big.json')).code, 'INVALID_DECISION_ANSWERS');
    writeFixture(outside, 'a.json', 'TOPSECRET');
    const e = captureThrow(() => readAnswersInput(root, `@${join(outside, 'a.json')}`));
    assert.equal(e.code, 'INVALID_DECISION_ANSWERS');
    assert.ok(!e.message.includes('TOPSECRET'));
    const e2 = captureThrow(() => readAnswersInput(root, '@../a.json'));
    assert.equal(e2.code, 'INVALID_DECISION_ANSWERS');
    writeFixture(root, 'junk.json', 'TOPSECRET {not json');
    const e3 = captureThrow(() => readAnswersInput(root, '@junk.json'));
    assert.equal(e3.code, 'INVALID_DECISION_ANSWERS');
    assert.ok(!e3.message.includes('TOPSECRET'));
    assert.equal(captureThrow(() => readAnswersInput(root, '{"a":1}')).code, 'INVALID_DECISION_ANSWERS');
    writeFixture(root, 'ok.json', '[{"blocker_ids":["a"],"choice":"c"}]');
    assert.deepEqual(readAnswersInput(root, '@ok.json'), [{ blocker_ids: ['a'], choice: 'c' }]);
    assert.deepEqual(readAnswersInput(root, '[{"blocker_ids":["a"],"choice":"c","note":"n"}]'), [{ blocker_ids: ['a'], choice: 'c', note: 'n' }]);
  } finally { cleanupTempDir(root); cleanupTempDir(outside); }
});

test('prose of an earlier entry containing a later entry heading does not leak into the later entry', () => {
  const root = seed([
    dec(hex(1), 'alpha', { prose: `Earlier prose.\n## ${hex(2)}\nHijacked sentence. More.` }),
    dec(hex(2), 'alpha', { prose: 'Own sentence. More.' }),
  ]);
  try {
    const p = computePending(root, SPEC);
    const by = Object.fromEntries(p.pending.map((x) => [x.blocker_id, x]));
    assert.equal(by[hex(1)].question, 'Earlier prose.');
    assert.equal(by[hex(2)].question, 'Own sentence.');
  } finally { cleanupTempDir(root); }
});

test('an entry with no prose fence derives the neutral question, not the next entry prose', () => {
  const root = seed([dec(hex(1), 'alpha'), dec(hex(2), 'alpha', { prose: 'Second prose. More.' })]);
  try {
    const sp = join(root, sidecarPathForSpec(SPEC));
    const t = readFileSync(sp, 'utf8');
    const head = t.indexOf(`## ${hex(1)}`);
    const next = t.indexOf(`## ${hex(2)}`);
    const yamlEnd = t.indexOf('```\n', t.indexOf('```yaml', head) + 7) + 4;
    writeFileSync(sp, t.slice(0, yamlEnd) + '\n' + t.slice(next));
    const p = computePending(root, SPEC);
    const by = Object.fromEntries(p.pending.map((x) => [x.blocker_id, x]));
    assert.equal(by[hex(1)].question, `Which option resolves blocker ${hex(1)}?`);
    assert.equal(by[hex(2)].question, 'Second prose.');
  } finally { cleanupTempDir(root); }
});

test('spec with a leading comment line before frontmatter: record and pending use the real revision and body', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q?' })], { spec: `<!-- lead -->\n${SPEC_TEXT}` });
  try {
    const p = computePending(root, SPEC);
    assert.equal(p.pending[0].header, 'Alpha');
    assert.deepEqual(p.decided.map((d) => d.dec), ['DEC-1']);
    assert.deepEqual(recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'A' }]).recorded, [hex(1)]);
  } finally { cleanupTempDir(root); }
});

test('empty answers array -> INVALID_DECISION_ANSWERS', () => {
  const root = seed([dec(hex(1), 'alpha', { question: 'Q?' })]);
  try {
    assert.equal(captureThrow(() => recordDecisions(root, SPEC, [])).code, 'INVALID_DECISION_ANSWERS');
    assert.equal(captureThrow(() => readAnswersInput(root, '[]')).code, 'INVALID_DECISION_ANSWERS');
  } finally { cleanupTempDir(root); }
});

test('default decision_recorded is an ISO-8601 UTC string; QUESTION_DERIVED carries fallback', () => {
  const root = seed([dec(hex(1), 'alpha'), dec(hex(2), 'alpha', { prose: '# bad. x' })]);
  try {
    const adv = computePending(root, SPEC).advisories.filter((a) => a.code === 'QUESTION_DERIVED');
    assert.deepEqual(adv.map((a) => [a.blocker_id, a.fallback]), [[hex(1), null], [hex(2), 'neutral']]);
    recordDecisions(root, SPEC, [{ blocker_ids: [hex(1)], choice: 'A' }]);
    const rec = computePending(root, SPEC).answered[0].decision_recorded;
    assert.match(rec, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  } finally { cleanupTempDir(root); }
});
