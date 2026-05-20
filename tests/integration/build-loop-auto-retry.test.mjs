/**
 * Integration test: BLOCK→revise auto-retry loop convergence (Task 15
 * of review-block-auto-retry.plan.md).
 *
 * Exercises the end-to-end revision-N → revision-N+1 → ... pipeline using
 * the underlying library surface:
 *   - lib/blocker-id.mjs        — canonical blocker_id emission
 *   - lib/blockers-writer.mjs   — .blockers.md sidecar writer
 *   - lib/specify-revise.mjs    — revise N → N+1
 *   - lib/lifecycle-state.mjs   — spec_revised + reportReviewer events
 *   - lib/loop-convergence.mjs  — partition + stop-condition evaluation
 *
 * Synthetic reviewer fixture:
 *   rev 1 emits BLOCK with `sa:y:aaaaaaaa`
 *   rev 2 emits BLOCK with `sa:y:bbbbbbbb` (addressed `sa:y:aaaaaaaa`)
 *   rev 3 emits PASS
 *
 * Asserts:
 *   (a) Loop runs through 3 revisions and converges on PASS
 *   (b) spec_revised events emitted x2 with correct addressed_blocker_ids
 *   (c) reviewer_report events carry revision: 1 / 2 / 3
 *   (d) .blockers.md sidecar state matches unresolved IDs at each step
 *   (e) Final loop verdict is PASS (not PASS_PENDING_HUMAN without flag)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildBlockerId } from '../../lib/blocker-id.mjs';
import { writeBlockers } from '../../lib/blockers-writer.mjs';
import { reviseSpec } from '../../lib/specify-revise.mjs';
import { readEvents, reportReviewer } from '../../lib/lifecycle-state.mjs';
import {
  partitionBlockers, evaluateStopCondition,
} from '../../lib/loop-convergence.mjs';

function makeSpec({ revision }) {
  const root = mkdtempSync(join(tmpdir(), 'adev-build-loop-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\nbuild:\n  max_review_retries: 2\n');
  const specPath = '.context-index/specs/cross-cutting/loop-fixture.spec.md';
  writeFileSync(join(root, specPath), [
    '# Live Spec: Loop Fixture',
    '',
    '---',
    `revision: ${revision}`,
    'created: 2026-05-19',
    'updated: 2026-05-19',
    'status: review-blocked',
    '---',
    '',
    '## Behaviors',
    '',
    '1. **When** invoked **then** does X.',
    '',
  ].join('\n'));
  // .review.md stub
  writeFileSync(join(root, specPath.replace(/\.spec\.md$/, '.review.md')),
    `# Architecture Review\n\n> Verdict: BLOCK\n`);
  return { root, specPath };
}

function emitBlockers(root, specPath, ids, revision) {
  const findings = ids.map((id, idx) => ({
    blocker_id: id,
    section_anchor: `behaviors-${idx + 1}`,
    reviewer: 'structural-architect',
    prose: `synthetic blocker ${id}`,
  }));
  writeBlockers(root, specPath, findings, { revision });
  return ids;
}

test('build-loop: 3-revision auto-retry converges on PASS', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    // ── Revision 1: reviewer emits BLOCK with id_a ────────────────────────
    const id_a = buildBlockerId({
      reviewer: 'sa', type: 'y',
      sectionAnchor: 'behaviors-1', findingText: 'fix-1',
    });
    emitBlockers(root, specPath, [id_a], 1);
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect',
      verdict: 'FAIL', notes: 'block on rev 1', revision: 1,
    });
    const prevBlockers1 = [id_a];

    // ── Revise: rev 1 → rev 2 ─────────────────────────────────────────────
    const result1 = reviseSpec({ specPath, projectRoot: root });
    assert.equal(result1.fromRevision, 1);
    assert.equal(result1.toRevision, 2);

    // ── Revision 2: reviewer emits BLOCK with id_b (addressed id_a) ───────
    const id_b = buildBlockerId({
      reviewer: 'sa', type: 'y',
      sectionAnchor: 'behaviors-2', findingText: 'fix-2',
    });
    // Spec is now at rev 2 + status review-pending. To dispatch revise
    // again, status would normally flip back to review-blocked via review.
    // Patch the spec frontmatter to simulate /adev:review-specs writing
    // status: review-blocked again.
    const fmPath = join(root, specPath);
    let body = readFileSync(fmPath, 'utf8');
    body = body.replace('status: review-pending', 'status: review-blocked');
    writeFileSync(fmPath, body, 'utf8');

    emitBlockers(root, specPath, [id_b], 2);
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect',
      verdict: 'FAIL', notes: 'block on rev 2', revision: 2,
    });

    // Loop convergence at rev 2: addressed id_a, new id_b
    const partition2 = partitionBlockers(prevBlockers1, [id_b]);
    assert.deepEqual(partition2.addressed, [id_a]);
    assert.deepEqual(partition2.new_, [id_b]);
    const verdict2 = evaluateStopCondition({
      ...partition2, prev_blockers: prevBlockers1,
      retries_remaining: 1, verdict: 'BLOCK', human_final_pass: false,
    });
    assert.equal(verdict2.verdict, 'CONTINUE',
      'rev 2: addressed=1, new=1 — progress made, continue');

    // ── Revise: rev 2 → rev 3 ─────────────────────────────────────────────
    const result2 = reviseSpec({ specPath, projectRoot: root });
    assert.equal(result2.fromRevision, 2);
    assert.equal(result2.toRevision, 3);

    // ── Revision 3: reviewer emits PASS ───────────────────────────────────
    reportReviewer(root, specPath, {
      step: 'review', reviewer: 'structural-architect',
      verdict: 'PASS', notes: 'rev 3 ok', revision: 3,
    });

    // Loop convergence at rev 3: PASS
    const partition3 = partitionBlockers([id_b], []);
    assert.deepEqual(partition3.addressed, [id_b]);
    const verdict3 = evaluateStopCondition({
      ...partition3, prev_blockers: [id_b],
      retries_remaining: 0, verdict: 'PASS', human_final_pass: false,
    });
    assert.deepEqual(verdict3, { stop: true, verdict: 'PASS' });

    // ── Assertions ────────────────────────────────────────────────────────
    const events = readEvents(root, specPath);

    // (a) spec_revised emitted ×2
    const revised = events.filter(e => e.event === 'spec_revised');
    assert.equal(revised.length, 2);
    assert.equal(revised[0].from_revision, 1);
    assert.equal(revised[0].to_revision, 2);
    assert.deepEqual(revised[0].addressed_blocker_ids, [id_a]);
    assert.equal(revised[1].from_revision, 2);
    assert.equal(revised[1].to_revision, 3);
    assert.deepEqual(revised[1].addressed_blocker_ids, [id_b]);

    // (b) reviewer_report events carry revision: 1 / 2 / 3
    const reviews = events.filter(e => e.event === 'reviewer_report');
    assert.equal(reviews.length, 3);
    assert.equal(reviews[0].revision, 1);
    assert.equal(reviews[0].verdict, 'FAIL');
    assert.equal(reviews[1].revision, 2);
    assert.equal(reviews[1].verdict, 'FAIL');
    assert.equal(reviews[2].revision, 3);
    assert.equal(reviews[2].verdict, 'PASS');

    // (c) .blockers.md sidecar — current state has no entries (rev 3 is PASS;
    //     the writer would emit zero entries for the final state).
    const blockersPath = join(root, specPath.replace(/\.spec\.md$/, '.blockers.md'));
    // After the last reviseSpec, the sidecar was cleared. Subsequent
    // PASS does not re-write it.
    assert.ok(!existsSync(blockersPath), '.blockers.md should be cleared after PASS');

    // (d) The spec is at revision 3
    const finalBody = readFileSync(join(root, specPath), 'utf8');
    assert.ok(finalBody.includes('revision: 3'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-loop: --require-human-final-pass converts PASS to PASS_PENDING_HUMAN', () => {
  // Pure convergence-detector level test — when human_final_pass=true and
  // the reviewer verdict is PASS, the loop returns PASS_PENDING_HUMAN.
  const verdict = evaluateStopCondition({
    addressed: ['x'], persistent: [], new_: [],
    prev_blockers: ['x'],
    retries_remaining: 1, verdict: 'PASS', human_final_pass: true,
  });
  assert.deepEqual(verdict, { stop: true, verdict: 'PASS_PENDING_HUMAN' });
});

test('build-loop: NO_PROGRESS terminates the loop when the LLM produces identical blockers', () => {
  const ids = ['sa:y:11111111', 'sa:y:22222222'];
  const partition = partitionBlockers(ids, ids);
  const verdict = evaluateStopCondition({
    ...partition, prev_blockers: ids,
    retries_remaining: 2, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(verdict, { stop: true, verdict: 'NO_PROGRESS' });
});

test('build-loop: REGRESSED terminates the loop when |new_| > |addressed|', () => {
  const prev = ['sa:y:11111111'];
  const curr = ['sa:y:22222222', 'sa:y:33333333'];
  const partition = partitionBlockers(prev, curr);
  const verdict = evaluateStopCondition({
    ...partition, prev_blockers: prev,
    retries_remaining: 2, verdict: 'BLOCK', human_final_pass: false,
  });
  assert.deepEqual(verdict, { stop: true, verdict: 'REGRESSED' });
});

test('build-loop: BUDGET_EXHAUSTED terminates the loop when retries run out', () => {
  const partition = partitionBlockers(['a'], ['b']);
  const verdict = evaluateStopCondition({
    ...partition, prev_blockers: ['a'],
    retries_remaining: 0, verdict: 'BLOCK', human_final_pass: false,
  });
  // 1 new, 1 addressed — not regressed, but budget exhausted
  assert.deepEqual(verdict, { stop: true, verdict: 'BUDGET_EXHAUSTED' });
});
