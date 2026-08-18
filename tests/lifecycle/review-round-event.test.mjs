// tests/lifecycle/review-round-event.test.mjs
//
// Task 3 of review-provenance.plan.md — the `review_round` emitter.
//
// Covers `reportReviewRound()`, the write-time validation guard for the
// `review_round` canonical event (review-provenance.spec.md Output Contract B).
// Validation lives in the lib rather than only in `lib/cli/report.mjs` so a
// forged or misspelled field cannot reach the append-only log via ANY caller.
// Failing the write is deliberate: the log is append-only, so a malformed event
// is permanent, whereas a malformed trailer is amendable.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reportReviewRound, readEvents } from '../../lib/lifecycle-state.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const SPEC = '.context-index/specs/features/demo/thing.spec.md';

function project() {
  const root = createTempDir();
  writeFixture(root, '.context-index/manifest.yaml', 'domain: software\n');
  writeFixture(root, SPEC, '---\ncharter: demo\n---\n# Thing\n');
  return root;
}

test('reportReviewRound writes a well-formed review_round event', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 2, findings: 1,
    });
    const events = readEvents(root, SPEC);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'review_round');
    assert.equal(events[0].stage, 'code-quality');
    assert.equal(events[0].cycles, 2);
    assert.equal(events[0].findings, 1);
    assert.ok(typeof events[0].ts === 'string' && events[0].ts.length > 0);
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound records cycles=1 for a first-pass stage (positive encoding)', () => {
  const root = project();
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'spec-compliance', cycles: 1,
    });
    const [ev] = readEvents(root, SPEC);
    assert.equal(ev.cycles, 1, 'first-pass is =1, never absence');
    assert.ok(!('findings' in ev), 'findings is omitted, not null, for spec-compliance');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound accepts findings for code-quality and synthesized only', () => {
  const root = project();
  try {
    for (const stage of ['code-quality', 'synthesized']) {
      reportReviewRound(root, SPEC, {
        plan: 'demo.plan.md', task_id: 't1', stage, cycles: 1, findings: 0,
      });
    }
    const events = readEvents(root, SPEC);
    assert.equal(events.length, 2);
    // `findings: 0` must PERSIST as a real recorded value, distinguishable from
    // omission (test 2 pins the omission half). A regression to a truthiness
    // spread — `...(findings ? { findings } : {})` — would silently drop the 0
    // and break "absence means not recorded, never zero".
    assert.deepEqual(events.map((ev) => ev.stage), ['code-quality', 'synthesized']);
    for (const ev of events) {
      assert.ok('findings' in ev, `findings key must be present for ${ev.stage}, not dropped as falsy`);
      assert.equal(ev.findings, 0, `findings must persist as 0 for ${ev.stage}`);
    }
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound rejects findings for spec-compliance (2f has no stable id convention)', () => {
  const root = project();
  try {
    assert.throws(
      () => reportReviewRound(root, SPEC, {
        plan: 'demo.plan.md', task_id: 't1', stage: 'spec-compliance', cycles: 1, findings: 2,
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID' && /findings/.test(err.message)
        && /spec-compliance/.test(err.message),
    );
    assert.equal(readEvents(root, SPEC).length, 0, 'nothing written on refusal');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound rejects a forged key, an out-of-enum stage, cycles<1 and findings<0', () => {
  const root = project();
  const base = { plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 };
  const bad = [
    [{ ...base, verdict: 'PASS' }, /verdict/],
    [{ ...base, stage: 'sanity-check' }, /stage/],
    [{ ...base, stage: 'Code-Quality' }, /stage/],
    [{ ...base, cycles: 0 }, /cycles/],
    [{ ...base, cycles: -1 }, /cycles/],
    [{ ...base, cycles: 1.5 }, /cycles/],
    [{ ...base, cycles: '2' }, /cycles/],
    [{ ...base, cycles: Number.NaN }, /cycles/],
    [{ ...base, cycles: Number.POSITIVE_INFINITY }, /cycles/],
    [{ ...base, findings: -1 }, /findings/],
    [{ ...base, plan: '' }, /plan/],
    [{ ...base, task_id: '' }, /task_id/],
  ];
  try {
    for (const [args, pattern] of bad) {
      assert.throws(
        () => reportReviewRound(root, SPEC, args),
        (err) => err.code === 'EVENT_SCHEMA_INVALID' && pattern.test(err.message),
        `expected refusal for ${JSON.stringify(args)}`,
      );
    }
    assert.equal(readEvents(root, SPEC).length, 0, 'no malformed event reached the log');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound never coerces a rejected value into a written one', () => {
  const root = project();
  try {
    assert.throws(
      () => reportReviewRound(root, SPEC, {
        plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: '3',
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID' && /cycles/.test(err.message),
    );
    assert.equal(readEvents(root, SPEC).length, 0, 'no silently-coerced cycles: 3 event');
  } finally { cleanupTempDir(root); }
});

test('reportReviewRound requires an args object', () => {
  const root = project();
  try {
    assert.throws(() => reportReviewRound(root, SPEC), (e) => e.code === 'EVENT_SCHEMA_INVALID');
  } finally { cleanupTempDir(root); }
});

// Spec AC 4's second half: "…and is not rejected under `strict`". Task 2 asserts the
// tier-1 producer emits no findings under the default `tag` mode; this pins the
// stricter mode directly, where an unregistered discriminator makes appendEvent throw.
test('a review_round write succeeds under event_diagnostics: strict', () => {
  const root = project();
  writeFixture(root, '.context-index/manifest.yaml',
    'domain: software\nlifecycle:\n  event_diagnostics: strict\n');
  try {
    reportReviewRound(root, SPEC, {
      plan: 'demo.plan.md', task_id: 't1', stage: 'code-quality', cycles: 1 });
    assert.equal(readEvents(root, SPEC).length, 1, 'strict mode must not reject the variant');
  } finally { cleanupTempDir(root); }
});
