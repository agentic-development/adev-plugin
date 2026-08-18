import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PLUGIN_ROOT } from '../helpers.mjs';

const read = (p) => readFileSync(join(PLUGIN_ROOT, p), 'utf8');
const EVENT_LOG_SPEC =
  '.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md';
const PLAN_TASK_SPEC =
  '.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md';

// Narrow the Behaviors section down to the single bullet that registers the
// review_round variant. Asserting against the whole section is
// non-discriminating: "last-wins" (code_drift_detected bullet) and
// "unknownEvents" (unknown-variant bullet) already appear elsewhere in
// Behaviors, so section-wide matches would pass pre-amendment.
function reviewRoundBehaviorBullet(body) {
  const behaviors = body.slice(body.indexOf('## Behaviors'), body.indexOf('## Postconditions'));
  const bullet = behaviors
    .split(/\n(?=- \*\*When\*\*)/)
    .find((chunk) => chunk.includes('reportReviewRound'));
  assert.ok(bullet, 'Behaviors must contain a bullet that registers reportReviewRound');
  return bullet;
}

test('lifecycle-event-log.spec.md registers review_round in Behaviors with its fold rule', () => {
  const bullet = reviewRoundBehaviorBullet(read(EVENT_LOG_SPEC));
  assert.match(bullet, /review_round/, 'the bullet must register the review_round variant');
  assert.match(bullet, /reviewRounds/, 'the bullet must name the reviewRounds projection field');
  assert.match(
    bullet,
    /\$\{plan\}::\$\{task_id\}::\$\{stage\}/,
    'the bullet must state the ${plan}::${task_id}::${stage} fold key',
  );
  assert.match(bullet, /last[- ]wins/i, 'the bullet must state the last-wins collision rule');
  assert.match(
    bullet,
    /unknownEvents/,
    'the bullet must state review_round does NOT land in unknownEvents[]',
  );
});

test('lifecycle-event-log.spec.md Acceptance Criteria enumerates reviewRounds as a legal projection key', () => {
  const body = read(EVENT_LOG_SPEC);
  const ac = body.slice(body.indexOf('## Acceptance Criteria'), body.indexOf('## Preconditions'));
  assert.match(ac, /reviewRounds/, 'the camelCase projection-key criterion must list reviewRounds');
  assert.match(ac, /review_round/, 'Acceptance Criteria must name the review_round variant');
  assert.match(ac, /reportReviewRound/, 'the exported-function criterion must list reportReviewRound');
});

test('plan-task-events.spec.md records that review metadata is carried by review_round', () => {
  const body = read(PLAN_TASK_SPEC);
  assert.match(body, /review_round/, 'the spec must name the review_round variant');
  assert.match(body, /review-provenance\.spec\.md/, 'the spec must cite the follow-up spec that discharges its new-variant clause');
  // Regression guard: the plan_task payload itself stays closed at four fields.
  assert.match(
    body,
    /`plan_task` events carry `plan`[^\n]*`task_id`[^\n]*`status`[^\n]*`notes`/,
    'plan_task payload description must be unchanged',
  );
});
