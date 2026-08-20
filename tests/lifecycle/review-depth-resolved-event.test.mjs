// tests/lifecycle/review-depth-resolved-event.test.mjs
//
// Task 6 — the `review_depth_resolved` canonical event + projection fold.
//
// Mirrors tests/lifecycle/review-round-event.test.mjs's structure for the
// `review_round` event: covers `reportReviewDepthResolved()`'s write-time
// validation guard and the `reviewDepthResolutions` projection fold.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reportReviewDepthResolved, currentState } from '../../lib/lifecycle-state.mjs';
import { CANONICAL_EVENTS } from '../../lib/lifecycle-events.mjs';
import { isKnownEventType, getRequiredFields } from '../../lib/diagnostics/event-schemas.mjs';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

const SPEC = '.context-index/specs/features/demo/thing.spec.md';

function project() {
  const root = createTempDir();
  writeFixture(root, '.context-index/manifest.yaml', 'domain: software\n');
  writeFixture(root, SPEC, '---\ncharter: demo\n---\n# Thing\n');
  return root;
}

test('review_depth_resolved is a canonical, known event type', () => {
  assert.ok(CANONICAL_EVENTS.has('review_depth_resolved'));
  assert.ok(isKnownEventType('review_depth_resolved'));
});

test("review_depth_resolved required fields match the spec's allow-list", () => {
  const fields = getRequiredFields('review_depth_resolved');
  for (const f of ['plan', 'task_id', 'pass', 'depth', 'source', 'floor_applied', 'floor_legs']) {
    assert.ok(fields.includes(f), `missing field ${f}`);
  }
});

test('reportReviewDepthResolved rejects an unknown key', () => {
  const root = project();
  try {
    assert.throws(
      () => reportReviewDepthResolved(root, SPEC, {
        plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'quick',
        source: 'predicate-grant', floor_applied: false, floor_legs: [], bogus: 'x',
      }),
      (err) => err.code === 'EVENT_SCHEMA_INVALID',
    );
  } finally { cleanupTempDir(root); }
});

test('reportReviewDepthResolved rejects an invalid pass or depth enum value', () => {
  const root = project();
  try {
    assert.throws(() => reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'middle', depth: 'quick',
      source: 's', floor_applied: false, floor_legs: [],
    }), (err) => err.code === 'EVENT_SCHEMA_INVALID');
    assert.throws(() => reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'partial',
      source: 's', floor_applied: false, floor_legs: [],
    }), (err) => err.code === 'EVENT_SCHEMA_INVALID');
  } finally { cleanupTempDir(root); }
});

test('reportReviewDepthResolved rejects malformed floor_applied / floor_legs / source / plan / task_id', () => {
  const root = project();
  const base = {
    plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'quick',
    source: 's', floor_applied: false, floor_legs: [],
  };
  const bad = [
    { ...base, floor_applied: 'false' },
    { ...base, floor_legs: 'none' },
    { ...base, source: 42 },
    { ...base, plan: '' },
    { ...base, task_id: '' },
  ];
  try {
    for (const args of bad) {
      assert.throws(
        () => reportReviewDepthResolved(root, SPEC, args),
        (err) => err.code === 'EVENT_SCHEMA_INVALID',
        `expected refusal for ${JSON.stringify(args)}`,
      );
    }
  } finally { cleanupTempDir(root); }
});

test('reportReviewDepthResolved writes a well-formed review_depth_resolved event', () => {
  const root = project();
  try {
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'full',
      source: 'floor', floor_applied: true, floor_legs: ['scope-mismatch'],
    });
    const state = currentState(root, SPEC);
    const key = state.reviewDepthResolutions['p.plan.md::t1::final'];
    assert.equal(key.depth, 'full');
    assert.equal(key.source, 'floor');
    assert.equal(key.floor_applied, true);
    assert.deepEqual(key.floor_legs, ['scope-mismatch']);
  } finally { cleanupTempDir(root); }
});

test('projection folds review_depth_resolved under reviewDepthResolutions, keyed plan::task_id::pass, last-wins', () => {
  const root = project();
  try {
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'provisional', depth: 'quick',
      source: 'predicate-grant', floor_applied: false, floor_legs: [],
    });
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'full',
      source: 'floor', floor_applied: true, floor_legs: ['scope-mismatch'],
    });
    const state = currentState(root, SPEC);
    const provisional = state.reviewDepthResolutions['p.plan.md::t1::provisional'];
    const final = state.reviewDepthResolutions['p.plan.md::t1::final'];
    assert.equal(provisional.depth, 'quick');
    assert.equal(final.depth, 'full');
  } finally { cleanupTempDir(root); }
});

test('duplicate (plan, task_id, pass) events fold last-wins', () => {
  const root = project();
  try {
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'quick',
      source: 'predicate-grant', floor_applied: false, floor_legs: [],
    });
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'full',
      source: 'floor', floor_applied: true, floor_legs: ['scope-mismatch'],
    });
    const state = currentState(root, SPEC);
    assert.equal(state.reviewDepthResolutions['p.plan.md::t1::final'].depth, 'full', 'last wins');
  } finally { cleanupTempDir(root); }
});

test('reviewDepthResolutions is an empty object when nothing was recorded', () => {
  const root = project();
  try {
    const state = currentState(root, SPEC);
    assert.deepEqual(state.reviewDepthResolutions, {});
  } finally { cleanupTempDir(root); }
});

test('review_depth_resolved never lands in the deprecated unknownEvents[]', () => {
  const root = project();
  try {
    reportReviewDepthResolved(root, SPEC, {
      plan: 'p.plan.md', task_id: 't1', pass: 'final', depth: 'quick',
      source: 'predicate-grant', floor_applied: false, floor_legs: [],
    });
    const state = currentState(root, SPEC);
    assert.deepEqual(state.unknownEvents, []);
  } finally { cleanupTempDir(root); }
});
