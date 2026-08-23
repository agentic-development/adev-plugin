import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildReviewRoundTrailer } from '../../lib/lifecycle-state.mjs';
import { createTempDir, cleanupTempDir, PLUGIN_ROOT, readSkillSurface } from '../helpers.mjs';

// Step 2's body moved into its own companion under progressive disclosure.
// 2h is the last subsection in that file, so it runs to end-of-file; slicing
// against the concatenated surface would span unrelated files instead.
const STEP_2 = readFileSync(
  join(PLUGIN_ROOT, 'skills', 'implement', 'references', 'steps', 'step-2-per-task-loop.md'),
  'utf8',
);
const step2h = STEP_2.slice(STEP_2.indexOf('#### 2h.'));

test('step 2h names buildReviewRoundTrailer as the sole trailer producer', () => {
  assert.match(step2h, /buildReviewRoundTrailer/);
  assert.match(step2h, /Review-round:/, 'the trailer key must be shown');
  assert.match(step2h, /only|sole/i, 'the helper must be named as the ONLY producer');
});

test('step 2h names the review_round emitter and its per-stage cardinality', () => {
  assert.match(step2h, /adev report --type review-round|reportReviewRound/);
  assert.match(step2h, /per stage|each stage|one per stage/i);
});

test('step 2h states that findings is omitted for the spec-compliance stage', () => {
  assert.match(
    step2h,
    /findings[^.]*never for[^.]*spec-compliance/is,
    'the omission relationship must be stated, not just the two words in isolation',
  );
});

test('step 2h keeps exactly-one-commit-per-task', () => {
  assert.match(step2h, /Commit-per-task is MANDATORY/);
  assert.match(step2h, /exactly one git commit/);
});

test('a multi-cycle task produces exactly one commit carrying both stage trailers', () => {
  const repo = createTempDir();
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 2;\n');
    writeFileSync(join(repo, 'thing.mjs'), 'export const a = 3;\n');
    git('add', 'thing.mjs');
    const message = [
      'feat(demo): add thing',
      '',
      'Spec: .context-index/specs/features/demo/thing.spec.md',
      'Plan-task: 1',
      buildReviewRoundTrailer('spec-compliance', 1),
      buildReviewRoundTrailer('code-quality', 3),
    ].join('\n');
    git('commit', '-q', '-m', message);

    assert.equal(git('log', '--oneline').trim().split('\n').length, 1,
      'three review cycles must still yield exactly one commit');

    const trailers = git('log', '-1', '--pretty=%B').split('\n')
      .filter((l) => l.startsWith('Review-round:'));
    assert.deepEqual(trailers, [
      'Review-round: spec-compliance=1',
      'Review-round: code-quality=3',
    ], 'one repeated trailer key per stage, cycles including the initial review');
    assert.ok(trailers.some((l) => l.endsWith('=1')), 'first-pass encoded as =1, not absence');
  } finally { cleanupTempDir(repo); }
});

test('review-provenance prose changes no cap, threshold, or dispatch count (Contract D)', () => {
  // Sliced from the Step 2 companion for the same reason as step2h above.
  const stage1 = STEP_2.slice(STEP_2.indexOf('#### 2f.'), STEP_2.indexOf('#### 2g.'));
  const stage2 = STEP_2.slice(STEP_2.indexOf('#### 2g.'), STEP_2.indexOf('#### 2h.'));
  assert.match(stage2, /Maximum `implement\.max_review_cycles` code-quality review cycles per task/);
  assert.match(stage2, /On any terminal non-PASS verdict, Stage 2 has NOT passed/);
  assert.ok(!/review[- ]round/i.test(stage1), 'Stage 1 prose must be untouched');
  assert.ok(!/review[- ]round/i.test(stage2), 'Stage 2 prose must be untouched');
});

test('step 2h adds no inline Node and no executable logic', () => {
  assert.ok(!/Run inline Node/i.test(step2h));
  assert.ok(!/node\s+--input-type=module\s+-e/.test(step2h));
  assert.ok(!/node\s+-e/.test(step2h));
});
