/**
 * Tests for lib/loop-convergence.mjs — Task 11 of review-block-auto-retry.plan.md.
 *
 * Covers Behaviors 7, 8, 9:
 *   - partitionBlockers(prev, curr) → { addressed, persistent, new_ }
 *   - evaluateStopCondition({...}) → { stop, verdict }
 *     verdicts: PASS / NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED /
 *               PASS_PENDING_HUMAN / CONTINUE
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  partitionBlockers,
  evaluateStopCondition,
} from '../../lib/loop-convergence.mjs';

// ── partitionBlockers ──────────────────────────────────────────────────────

test('partitionBlockers partitions ids into addressed / persistent / new_', () => {
  const prev = ['a', 'b', 'c'];
  const curr = ['b', 'c', 'd', 'e'];
  const { addressed, persistent, new_ } = partitionBlockers(prev, curr);
  assert.deepEqual(addressed.sort(), ['a']);
  assert.deepEqual(persistent.sort(), ['b', 'c']);
  assert.deepEqual(new_.sort(), ['d', 'e']);
});

test('partitionBlockers — all addressed (curr empty)', () => {
  const { addressed, persistent, new_ } = partitionBlockers(['a', 'b'], []);
  assert.deepEqual(addressed.sort(), ['a', 'b']);
  assert.deepEqual(persistent, []);
  assert.deepEqual(new_, []);
});

test('partitionBlockers — all new (prev empty)', () => {
  const { addressed, persistent, new_ } = partitionBlockers([], ['a', 'b']);
  assert.deepEqual(addressed, []);
  assert.deepEqual(persistent, []);
  assert.deepEqual(new_.sort(), ['a', 'b']);
});

test('partitionBlockers — identical sets (all persistent)', () => {
  const { addressed, persistent, new_ } = partitionBlockers(['a', 'b'], ['a', 'b']);
  assert.deepEqual(addressed, []);
  assert.deepEqual(persistent.sort(), ['a', 'b']);
  assert.deepEqual(new_, []);
});

test('partitionBlockers — duplicate ids are deduplicated', () => {
  const { addressed, persistent, new_ } = partitionBlockers(['a', 'a', 'b'], ['b', 'b', 'c']);
  assert.deepEqual(addressed, ['a']);
  assert.deepEqual(persistent, ['b']);
  assert.deepEqual(new_, ['c']);
});

// ── evaluateStopCondition ──────────────────────────────────────────────────

test('evaluateStopCondition returns PASS when curr verdict is PASS', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: [], new_: [], prev_blockers: ['a'],
    retries_remaining: 5, verdict: 'PASS', human_final_pass: false,
  });
  assert.deepEqual(r, { stop: true, verdict: 'PASS' });
});

test('evaluateStopCondition returns PASS_PENDING_HUMAN when verdict PASS + gate on', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: [], new_: [], prev_blockers: ['a'],
    retries_remaining: 5, verdict: 'PASS', human_final_pass: true,
  });
  assert.deepEqual(r, { stop: true, verdict: 'PASS_PENDING_HUMAN' });
});

test('evaluateStopCondition returns NO_PROGRESS when persistent == prev and no addressed/new', () => {
  const r = evaluateStopCondition({
    addressed: [], persistent: ['a', 'b'], new_: [],
    prev_blockers: ['a', 'b'],
    retries_remaining: 5, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(r, { stop: true, verdict: 'NO_PROGRESS' });
});

test('evaluateStopCondition returns REGRESSED when |new_| > |addressed|', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: [], new_: ['b', 'c'],
    prev_blockers: ['a'],
    retries_remaining: 5, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(r, { stop: true, verdict: 'REGRESSED' });
});

test('evaluateStopCondition does NOT regress when |new_| === |addressed|', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: [], new_: ['b'],
    prev_blockers: ['a'],
    retries_remaining: 5, verdict: 'BLOCK', human_final_pass: false,
  });
  // 1 == 1 — not strictly greater — so loop continues
  assert.equal(r.stop, false);
  assert.equal(r.verdict, 'CONTINUE');
});

test('evaluateStopCondition returns BUDGET_EXHAUSTED when retries_remaining === 0 and not PASS', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: ['b'], new_: ['c'],
    prev_blockers: ['a', 'b'],
    retries_remaining: 0, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(r, { stop: true, verdict: 'BUDGET_EXHAUSTED' });
});

test('evaluateStopCondition returns CONTINUE when progress is made and retries remain', () => {
  const r = evaluateStopCondition({
    addressed: ['a'], persistent: ['b'], new_: [],
    prev_blockers: ['a', 'b'],
    retries_remaining: 1, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(r, { stop: false, verdict: 'CONTINUE' });
});

test('evaluateStopCondition NO_PROGRESS takes priority over BUDGET_EXHAUSTED', () => {
  // When both conditions are true, NO_PROGRESS is the more informative signal.
  const r = evaluateStopCondition({
    addressed: [], persistent: ['a'], new_: [],
    prev_blockers: ['a'],
    retries_remaining: 0, verdict: 'BLOCK', human_final_pass: false,
  });
  // NO_PROGRESS dominates because the operator can't make progress regardless of budget
  assert.equal(r.stop, true);
  assert.equal(r.verdict, 'NO_PROGRESS');
});

test('evaluateStopCondition first revision (prev_blockers empty) — pure new_ does NOT regress', () => {
  // Rev 1: no prior blockers. Rev 2 found N blockers. This is the normal
  // first-revision case; addressed === 0 trivially but it's not regression.
  const r = evaluateStopCondition({
    addressed: [], persistent: [], new_: ['a', 'b', 'c'],
    prev_blockers: [],
    retries_remaining: 2, verdict: 'BLOCK', human_final_pass: false,
  });
  // First-time blockers are not a regression — they're the initial finding.
  // The loop only "regresses" when there were prior blockers and the next
  // revision adds more without addressing the prior.
  assert.equal(r.stop, false);
  assert.equal(r.verdict, 'CONTINUE');
});
