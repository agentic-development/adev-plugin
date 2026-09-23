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
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { buildBlockerId } from '../../lib/blocker-id.mjs';
import { writeBlockers } from '../../lib/blockers-writer.mjs';
import { reviseSpec, parseBlockersSidecar } from '../../lib/specify-revise.mjs';
import { readEvents, reportReviewer } from '../../lib/lifecycle-state.mjs';
import {
  partitionBlockers, evaluateStopCondition,
} from '../../lib/loop-convergence.mjs';
import { renderRemedyRef } from '../../lib/governance/remedy-ref-render.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../../cli/index.mjs');

function runAdev(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
}

function makeSpec({ revision }) {
  const root = mkdtempSync(join(tmpdir(), 'adev-build-loop-'));
  mkdirSync(join(root, '.context-index/specs/cross-cutting'), { recursive: true });
  mkdirSync(join(root, '.context-index/lifecycle-state'), { recursive: true });
  writeFileSync(join(root, '.context-index/manifest.yaml'),
    'project:\n  name: test\nlifecycle:\n  event_diagnostics: off\nbuild:\n  max_review_retries: 2\n');
  const specPath = '.context-index/specs/cross-cutting/loop-fixture.spec.md';
  // Real per-blocker headings ("Behaviors 1" / "Behaviors 2") so section_anchor
  // values (Task 6's real-diff splicing needs a matching heading, not a
  // synthetic anchor with no backing content) resolve to actual sections.
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
    '## Behaviors 1',
    '',
    '1. **When** invoked **then** does X (original).',
    '',
    '## Behaviors 2',
    '',
    '1. **When** invoked **then** does Y (original).',
    '',
  ].join('\n'));
  // .review.md stub
  writeFileSync(join(root, specPath.replace(/\.spec\.md$/, '.review.md')),
    `# Architecture Review\n\n> Verdict: BLOCK\n`);
  return { root, specPath };
}

function emitBlockers(root, specPath, ids, revision, opts = {}) {
  const findings = ids.map((id, idx) => ({
    blocker_id: id,
    section_anchor: opts.sectionAnchors?.[idx] ?? `behaviors-${idx + 1}`,
    reviewer: 'structural-architect',
    prose: `synthetic blocker ${id}`,
    ...(opts.findingClasses ? { finding_class: opts.findingClasses[idx] } : {}),
    ...(opts.remedyRefs?.[idx] ? { remedy_ref: opts.remedyRefs[idx] } : {}),
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
    // Simulates BEH-4's per-anchor authoring subagent fan-out: the anchor
    // implicated by id_a's blocker gets a real rewritten body, so Task 6's
    // real-diff logic marks it addressed (not the pre-Task-6 blanket
    // acknowledgement this whole plan exists to remove).
    const result1 = reviseSpec({
      specPath, projectRoot: root,
      authoredSections: new Map([['behaviors-1', '1. **When** invoked **then** does X (revised for id_a).']]),
    });
    assert.equal(result1.fromRevision, 1);
    assert.equal(result1.toRevision, 2);
    assert.deepEqual(result1.addressed, [id_a]);

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

    emitBlockers(root, specPath, [id_b], 2, { sectionAnchors: ['behaviors-2'] });
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
    const result2 = reviseSpec({
      specPath, projectRoot: root,
      authoredSections: new Map([['behaviors-2', '1. **When** invoked **then** does Y (revised for id_b).']]),
    });
    assert.equal(result2.fromRevision, 2);
    assert.equal(result2.toRevision, 3);
    assert.deepEqual(result2.addressed, [id_b]);

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

// ── finding_class branches, mechanism-existence inner cap, NOT_CONVERGING ──

test('build-loop: a decision-classed reviewer finding flows through blockers write + group-blockers into the DECISION_REQUIRED halt signal', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    // Reviewer output as review-specs Step 6 hands it over: finding_type, no
    // blocker_id — the verb derives the id, so this exercises the same path.
    const findings = [
      { reviewer: 'sa', finding_type: 'y', section_anchor: 'behaviors-1', prose: 'needs a human call on retry semantics', finding_class: 'decision' },
      { reviewer: 'sa', finding_type: 'y', section_anchor: 'behaviors-2', prose: 'missing error path', finding_class: 'defect' },
    ];
    const write = runAdev(root, ['blockers', 'write', '--spec', specPath, '--findings', JSON.stringify(findings), '--revision', '1', '--json']);
    assert.equal(write.status, 0, write.stderr);
    assert.strictEqual(JSON.parse(write.stdout).entries, 2);

    const group = runAdev(root, ['specify', 'group-blockers', '--spec', specPath]);
    assert.equal(group.status, 0, group.stderr);
    const payload = JSON.parse(group.stdout.trim());
    const decisionId = buildBlockerId({ reviewer: 'sa', type: 'y', sectionAnchor: 'behaviors-1', findingText: findings[0].prose });
    // blocker-auto-retry-loop.md step 4 halts with DECISION_REQUIRED exactly
    // when decision_blocker_ids is non-empty, before any authoring dispatch.
    assert.deepStrictEqual(payload.decision_blocker_ids, [decisionId]);
    assert.deepStrictEqual(Object.keys(payload.anchors), ['behaviors-2'],
      'only the defect finding may form an authoring group');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-loop: an external-classed blocker is excluded from convergence accounting and renders an External Remedies line', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    const id_defect = buildBlockerId({
      reviewer: 'sa', type: 'y', sectionAnchor: 'behaviors-1', findingText: 'fix-defect',
    });
    const id_external = buildBlockerId({
      reviewer: 'sa', type: 'y', sectionAnchor: 'behaviors-2', findingText: 'needs-external-system',
    });
    emitBlockers(root, specPath, [id_defect, id_external], 1, {
      sectionAnchors: ['behaviors-1', 'behaviors-2'],
      findingClasses: ['defect', 'external'],
      remedyRefs: [null, 'see ADR-0022'],
    });

    const blockersText = readFileSync(
      join(root, specPath.replace(/\.spec\.md$/, '.blockers.md')), 'utf8',
    );
    const entries = parseBlockersSidecar(blockersText);
    const externalEntry = entries.find(e => e.blocker_id === id_external);
    assert.strictEqual(externalEntry.finding_class, 'external');
    assert.strictEqual(externalEntry.remedy_ref, 'see ADR-0022');


    // Convergence accounting excludes the external id from both blocker
    // sets before partitioning — only the defect id participates. The
    // reviewer's own verdict (still BLOCK, since the external issue is
    // still genuinely unresolved from its perspective) is what determines
    // PASS; excluding the external id only affects the ADDRESSED/PERSISTENT/
    // NEW accounting the convergence detector uses to judge progress on the
    // defect blockers, not the top-level verdict.
    const prevBlockers = [id_defect, id_external];
    const currBlockers = [id_external]; // defect addressed, external persists untouched
    const externalIds = new Set([id_external]);
    const filteredPrev = prevBlockers.filter(id => !externalIds.has(id));
    const filteredCurr = currBlockers.filter(id => !externalIds.has(id));
    const partition = partitionBlockers(filteredPrev, filteredCurr);
    assert.deepEqual(partition.addressed, [id_defect]);
    assert.deepEqual(partition.persistent, []);
    assert.deepEqual(partition.new_, []);
    const verdict = evaluateStopCondition({
      ...partition, prev_blockers: filteredPrev,
      retries_remaining: 1, verdict: 'BLOCK', human_final_pass: false,
    });
    // Progress was genuinely made on the defect set (addressed=1, new=0,
    // persistent=0) with retries remaining -> CONTINUE, not a false
    // NO_PROGRESS/REGRESSED misfire the unfiltered external id could cause
    // if it were left in the accounting.
    assert.strictEqual(verdict.verdict, 'CONTINUE',
      'excluding the external id from accounting must not misclassify genuine defect-set progress as stuck');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-loop: mechanism-existence inner retries re-author the same revision, so they never consume an outer retry', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    const findings = [{ reviewer: 'sa', finding_type: 'y', section_anchor: 'behaviors-1', prose: 'X is underspecified', finding_class: 'defect' }];
    assert.equal(runAdev(root, ['blockers', 'write', '--spec', specPath, '--findings', JSON.stringify(findings), '--revision', '1']).status, 0);

    // Step 5a: the outer pass produces revision 2, and the authored body cites
    // a referent that does not exist.
    const badBody = (n) => `1. **When** invoked **then** see \`lib/does-not-exist-${n}.mjs:1\`.`;
    const first = runAdev(root, ['specify', 'revise', '--spec', specPath, '--auto',
      '--authored-sections', JSON.stringify({ 'behaviors-1': badBody(0) })]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout.trim()).to_revision, 2);

    // Steps 5b/5c: check, re-author on the same revision, re-check — up to
    // the 3-attempt cap.
    let attempts = 0;
    for (let n = 1; n <= 3; n++) {
      const check = runAdev(root, ['specify', 'check-mechanisms', '--spec', specPath]);
      assert.equal(check.status, 2, 'the cited referent never resolves');
      const unresolved = JSON.parse(check.stdout.trim()).unresolved;
      assert.strictEqual(unresolved[0].section_anchor, 'behaviors-1');
      attempts++;
      if (attempts === 3) break;
      const mechFindings = unresolved.map(u => ({
        reviewer: 'build-loop', finding_type: 'mechanism-existence', finding_class: 'defect',
        section_anchor: u.section_anchor, prose: `Unresolved referent ${u.candidate}: ${u.reason}`,
      }));
      const mechWrite = runAdev(root, ['blockers', 'write', '--spec', specPath, '--findings', JSON.stringify(mechFindings), '--revision', '2']);
      assert.equal(mechWrite.status, 0, mechWrite.stderr);
      const regroup = JSON.parse(runAdev(root, ['specify', 'group-blockers', '--spec', specPath]).stdout.trim());
      assert.deepStrictEqual(Object.keys(regroup.anchors), ['behaviors-1']);
      const retry = runAdev(root, ['specify', 'revise', '--spec', specPath, '--same-revision',
        '--authored-sections', JSON.stringify({ 'behaviors-1': badBody(n) })]);
      assert.equal(retry.status, 0, `inner retry ${n} must not hit SPEC_NOT_BLOCKED: ${retry.stderr}`);
      assert.equal(JSON.parse(retry.stdout.trim()).to_revision, 2);
    }
    assert.strictEqual(attempts, 3);

    // The outer budget is charged per revision produced (one spec_revised per
    // outer pass). Three inner attempts left both at exactly one.
    const body = readFileSync(join(root, specPath), 'utf8');
    assert.ok(body.includes('revision: 2'));
    assert.ok(body.includes('does-not-exist-2.mjs'), 'the last inner attempt was spliced');
    const revised = readEvents(root, specPath).filter(e => e.event === 'spec_revised');
    assert.strictEqual(revised.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('build-loop: NOT_CONVERGING reaches the verdict-action table and halts distinctly from NO_PROGRESS', () => {
  // Blocker count non-decreasing for `not_converging_window` (2) consecutive
  // cycles, but the exact blocker set keeps changing cycle to cycle — so
  // NO_PROGRESS's stricter identical-set check never fires; NOT_CONVERGING
  // is what actually catches this non-convergent pattern (TR-4).
  const partition = partitionBlockers(['a', 'b'], ['c', 'd']);
  const verdict = evaluateStopCondition({
    ...partition, prev_blockers: ['a', 'b'],
    retries_remaining: 1, verdict: 'BLOCK', human_final_pass: false,
    blocker_count_history: [2, 2, 2],
    not_converging_window: 2,
  });
  assert.strictEqual(verdict.verdict, 'NOT_CONVERGING');
  // Distinct from NO_PROGRESS: NO_PROGRESS requires persistent === prev_blockers
  // (the identical set), which does not hold here (a,b vs c,d).
  assert.notStrictEqual(verdict.verdict, 'NO_PROGRESS');
});

// ── External Remedies two-channel consistency (WR-3) ──────────────────────

test('External Remedies: the review report rows and the build progress line carry byte-identical remedy_ref', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    const longRef = `see ADR-0022 ${'x'.repeat(300)}`;
    const findings = [{ reviewer: 'sa', finding_type: 'y', section_anchor: 'behaviors-3', prose: 'needs an external system change', finding_class: 'external', remedy_ref: longRef }];
    // Report channel: review-specs Step 5 copies rows from externalRemedies.
    const write = runAdev(root, ['blockers', 'write', '--spec', specPath, '--findings', JSON.stringify(findings), '--revision', '1', '--json']);
    assert.equal(write.status, 0, write.stderr);
    const reportRows = JSON.parse(write.stdout).externalRemedies;
    // Progress-line channel: the build loop reads group-blockers after the
    // sidecar round-trip.
    const group = runAdev(root, ['specify', 'group-blockers', '--spec', specPath]);
    assert.equal(group.status, 0, group.stderr);
    const progressRows = JSON.parse(group.stdout.trim()).external_blockers;

    assert.strictEqual(reportRows.length, 1);
    assert.deepStrictEqual(progressRows, reportRows);
    assert.strictEqual(reportRows[0].remedy_ref, renderRemedyRef(longRef));
    assert.ok(reportRows[0].remedy_ref.endsWith('...'), 'rendered, not raw');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
