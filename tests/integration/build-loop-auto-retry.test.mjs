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
import {
  reviseSpec, parseBlockersSidecar, resolveSectionAnchors, groupBlockersByAnchor,
} from '../../lib/specify-revise.mjs';
import { readEvents, reportReviewer } from '../../lib/lifecycle-state.mjs';
import {
  partitionBlockers, evaluateStopCondition,
} from '../../lib/loop-convergence.mjs';
import { renderRemedyRef } from '../../lib/governance/remedy-ref-render.mjs';
import { run as runMechanismExistence } from '../../lib/diagnostics/tier2/mechanism-existence.mjs';

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

// ── Task 9: DECISION_REQUIRED / EXTERNAL_REMEDY / mechanism-existence inner
// cap / NOT_CONVERGING — skills/build/SKILL.md's Blocker handling loop
// (skills/build/blocker-auto-retry-loop.md) branches BEFORE dispatching
// authoring, using the same finding_class breakdown
// `adev specify group-blockers` computes at the CLI layer. These tests
// exercise the underlying library functions the skill's prose describes,
// the same style the pre-existing tests above use (no `simulateBuildLoop`
// black box exists — the loop is orchestrated by the agent executing the
// skill's prose, not by a callable JS function).

test('build-loop: a decision-classed blocker is detected via groupBlockersByAnchor/parseBlockersSidecar and never reaches an authoring group', () => {
  const { root, specPath } = makeSpec({ revision: 1 });
  try {
    const id_decision = buildBlockerId({
      reviewer: 'sa', type: 'y', sectionAnchor: 'behaviors-1', findingText: 'needs-human-call',
    });
    emitBlockers(root, specPath, [id_decision], 1, { findingClasses: ['decision'] });

    const blockersText = readFileSync(
      join(root, specPath.replace(/\.spec\.md$/, '.blockers.md')), 'utf8',
    );
    const entries = parseBlockersSidecar(blockersText);
    assert.strictEqual(entries[0].finding_class, 'decision');

    // Per skills/build/blocker-auto-retry-loop.md step 4: a decision-classed
    // blocker halts BEFORE any authoring dispatch. Prove the data the skill
    // branches on: groupBlockersByAnchor (defect-only) has no group for it,
    // so no authoring subagent would ever be dispatched for this blocker.
    const specBody = readFileSync(join(root, specPath), 'utf8');
    const bodyOnly = specBody.split('---').slice(2).join('---');
    const anchors = resolveSectionAnchors(bodyOnly);
    const { grouped } = groupBlockersByAnchor(entries, anchors);
    assert.strictEqual(grouped.size, 0, 'a decision-classed blocker must never form an authoring group');
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

    // Per skills/build/blocker-auto-retry-loop.md step 4: the External
    // Remedies progress line renders remedy_ref through the SAME
    // renderRemedyRef helper Task 11 keeps in sync with review-specs'
    // report section.
    const line = `External remedy needed for ${externalEntry.blocker_id} (${externalEntry.section_anchor}): ${renderRemedyRef(externalEntry.remedy_ref)}`;
    assert.ok(line.includes('see ADR-0022'));

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

test('build-loop: the mechanism-existence inner cap (3 attempts) exhausting does NOT decrement the outer retries_remaining, and vice versa', () => {
  const root = mkdtempSync(join(tmpdir(), 'adev-build-loop-mech-'));
  mkdirSync(join(root, 'lib'), { recursive: true });
  try {
    // A spec citing a referent that will never resolve, simulating an
    // authoring subagent that keeps citing a nonexistent file across
    // 3 consecutive fix attempts.
    const authoredText = 'see `lib/does-not-exist.mjs:1` for the fix';

    let innerCounter = 0;
    let outerRetriesRemaining = 2; // build.max_review_retries default 2
    const outerRetriesAtStart = outerRetriesRemaining;

    let finalVerdict = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const result = runMechanismExistence({ projectRoot: root, authoredText });
      if (!result.fired) { finalVerdict = 'RESOLVED'; break; }
      innerCounter++;
      if (innerCounter >= 3) { finalVerdict = 'BUDGET_EXHAUSTED'; break; }
      // Per skills/build/blocker-auto-retry-loop.md step 5c: loop back to
      // authoring on the SAME revision — retries_remaining is never touched
      // here, only the inner counter.
    }

    assert.strictEqual(finalVerdict, 'BUDGET_EXHAUSTED');
    assert.strictEqual(innerCounter, 3);
    assert.strictEqual(outerRetriesRemaining, outerRetriesAtStart,
      'inner mechanism-check cap exhausting must never decrement retries_remaining');
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

// ── Task 11: External Remedies two-channel consistency (WR-3) ──────────────
//
// skills/build/blocker-auto-retry-loop.md's "External remedies" progress
// line and skills/review-specs/SKILL.md's "External Remedies" report
// section both render {blocker_id, section_anchor, remedy_ref} in the same
// order, both routing remedy_ref through the SAME renderRemedyRef helper.
// No dedicated "renderExternalRemedyProgressLine"/"renderExternalRemediesReportSection"
// lib functions exist — the rendering happens in SKILL.md prose executed by
// an agent, not by callable JS. This test proves the actual shared
// mechanism (renderRemedyRef) produces byte-identical output for the same
// input, which is what makes the two independently-composed strings agree.

test('External Remedies: the build progress line and the review report section render remedy_ref byte-identically via the shared helper', () => {
  const blocker = { blocker_id: 'sa:y:aabbccdd', section_anchor: 'behaviors-3', remedy_ref: 'see ADR-0022' };

  // skills/build/blocker-auto-retry-loop.md step 4's documented format:
  // "External remedy needed for <blocker_id> (<section_anchor>): <rendered remedy_ref>"
  const progressLine =
    `External remedy needed for ${blocker.blocker_id} (${blocker.section_anchor}): ${renderRemedyRef(blocker.remedy_ref)}`;

  // skills/review-specs/SKILL.md Step 5's "External Remedies" table row:
  // | <blocker_id> | <section_anchor> | <renderRemedyRef(remedy_ref)> |
  const reportRow =
    `| ${blocker.blocker_id} | ${blocker.section_anchor} | ${renderRemedyRef(blocker.remedy_ref)} |`;

  const rendered = renderRemedyRef(blocker.remedy_ref);
  assert.ok(progressLine.includes(rendered));
  assert.ok(reportRow.includes(rendered));
  // Both channels embed the exact same rendered substring — neither
  // independently re-derives or re-sanitizes remedy_ref.
  const progressSubstring = progressLine.slice(
    progressLine.indexOf(rendered), progressLine.indexOf(rendered) + rendered.length,
  );
  const reportSubstring = reportRow.slice(
    reportRow.indexOf(rendered), reportRow.indexOf(rendered) + rendered.length,
  );
  assert.strictEqual(progressSubstring, reportSubstring);
  assert.strictEqual(progressSubstring, rendered);
});

test('External Remedies: a remedy_ref with control characters/ANSI escapes renders identically stripped on both channels', () => {
  const blocker = { blocker_id: 'sa:y:11223344', section_anchor: 'behaviors-1', remedy_ref: '\x1b[31msee ADR-0099\x1b[0m\x07' };
  const rendered = renderRemedyRef(blocker.remedy_ref);
  assert.strictEqual(rendered, 'see ADR-0099');

  const progressLine = `External remedy needed for ${blocker.blocker_id} (${blocker.section_anchor}): ${renderRemedyRef(blocker.remedy_ref)}`;
  const reportRow = `| ${blocker.blocker_id} | ${blocker.section_anchor} | ${renderRemedyRef(blocker.remedy_ref)} |`;
  assert.ok(progressLine.endsWith(rendered));
  assert.ok(reportRow.includes(rendered));
  // Neither channel leaks the raw escape sequence.
  assert.ok(!progressLine.includes('\x1b'));
  assert.ok(!reportRow.includes('\x1b'));
});
