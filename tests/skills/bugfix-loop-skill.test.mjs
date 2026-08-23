// tests/skills/bugfix-loop-skill.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 8, 10, 11
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSkillSurface } from '../helpers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;

// Step bodies moved into per-step companions under progressive disclosure
// (skills/bugfix-loop/references/steps/). Tests below that need to slice
// content between two step boundaries read the companions directly, joined
// in the skill's own logical step order -- readSkillSurface's alphabetical
// concatenation does not preserve that order, since every SKILL.md summary
// stub sorts before any references/ file.
const STEPS_DIR = join(ROOT, 'skills', 'bugfix-loop', 'references', 'steps');
const readStep = (name) => readFileSync(join(STEPS_DIR, name), 'utf8');
const STEP0 = readStep('step-0-resolve-the-run.md');
const STEP1 = readStep('step-1-turn-guard.md');
const STEP2 = readStep('step-2-select-a-bug.md');
const STEP3 = readStep('step-3-claim.md');
const STEP4 = readStep('step-4-attempt.md');
const STEP45 = readStep('step-4.5-commit-and-pr.md');
const STEP5 = readStep('step-5-finish.md');
const STEP6 = readStep('step-6-self-reinvoke.md');
const FULL_STEPS = [STEP0, STEP1, STEP2, STEP3, STEP4, STEP45, STEP5, STEP6].join('\n\n');

test('bugfix-loop SKILL.md declares --max-bugs, --max-turns, --github-sync, --resume, --resume-run-id', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const flag of ['--max-bugs', '--max-turns', '--github-sync', '--resume', '--resume-run-id']) {
    assert.ok(md.includes(flag), `Arguments must document ${flag}`);
  }
});

test('bugfix-loop SKILL.md includes a Load Skill Extensions block (AC bullet 5)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev skill-ext load --skill bugfix-loop/);
});

test('bugfix-loop SKILL.md emits ADEV-BUGFIXLOOP for all three terminal states, final line (AC bullet 6)', () => {
  for (const tok of ['ADEV-BUGFIXLOOP: COMPLETE', 'ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED', 'ADEV-BUGFIXLOOP: BLOCKED']) {
    assert.ok(TOKEN_GRAMMAR.test(tok));
    assert.ok(STEP5.includes(tok), `must instruct emitting "${tok}"`);
  }
  assert.match(STEP5, /(final line|last line)/i);
});

test('bugfix-loop SKILL.md self-re-invokes via the Skill tool between non-terminal turns', () => {
  assert.match(STEP6, /--resume --resume-run-id/);
  assert.match(STEP6, /Skill tool/);
});

test('bugfix-loop SKILL.md reads the status guard before calling adev issues next (AC bullet 8)', () => {
  const guardIdx = FULL_STEPS.indexOf('bugfix-loop guard');
  const nextIdx = FULL_STEPS.indexOf('issues next');
  assert.ok(guardIdx !== -1 && nextIdx !== -1 && guardIdx < nextIdx, 'guard must be called before issues next');
});

test('bugfix-loop SKILL.md bounds claim-failure retries to 3 within a turn (AC bullet 14)', () => {
  assert.match(STEP3, /\b3\b[\s\S]{0,80}retr|retr[\s\S]{0,80}\b3\b/i);
});

test('bugfix-loop SKILL.md wires --github-sync to adev tracker-sync inbound/outbound (no longer fails fast)', () => {
  assert.match(FULL_STEPS, /adev tracker-sync inbound/);
  assert.match(FULL_STEPS, /adev tracker-sync outbound/);
  assert.doesNotMatch(FULL_STEPS, /GitHub sync not available/);
});

test('bugfix-loop SKILL.md calls tracker-sync inbound before Step 2 bug selection', () => {
  const inboundIdx = FULL_STEPS.indexOf('tracker-sync inbound');
  const step2Idx = FULL_STEPS.indexOf('## Step 2: Select a bug');
  assert.ok(inboundIdx !== -1 && step2Idx !== -1 && inboundIdx < step2Idx, 'inbound sync must run before Step 2');
});

test('bugfix-loop SKILL.md calls tracker-sync outbound after the Step 4 attempt completes', () => {
  const step4Idx = FULL_STEPS.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const outboundIdx = FULL_STEPS.indexOf('tracker-sync outbound');
  const step5Idx = FULL_STEPS.indexOf('## Step 5: Finish');
  assert.ok(step4Idx !== -1 && outboundIdx !== -1 && step5Idx !== -1);
  assert.ok(step4Idx < outboundIdx && outboundIdx < step5Idx, 'outbound writeback must run within Step 4, before Step 5');
});

test('bugfix-loop SKILL.md Step 0/1 calls adev bugfix-loop check-freshness before the status/budget guard (Plan-task 3)', () => {
  assert.match(FULL_STEPS, /adev bugfix-loop check-freshness/);
  const freshnessIdx = FULL_STEPS.indexOf('adev bugfix-loop check-freshness');
  const guardIdx = FULL_STEPS.indexOf('adev bugfix-loop guard');
  assert.ok(freshnessIdx !== -1 && guardIdx !== -1 && freshnessIdx < guardIdx, 'check-freshness must be called before the guard');
});

test('bugfix-loop SKILL.md documents BRANCH_STALE_BLOCKED halting before bug selection (Plan-task 3)', () => {
  assert.match(STEP0, /BRANCH_STALE_BLOCKED/);
  assert.match(STEP0, /FRESHNESS_CHECK_DEGRADED/);
});

test('bugfix-loop SKILL.md documents --worktree-per-bug and --auto-commit arguments, default OFF (Plan-task 6)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--worktree-per-bug/);
  assert.match(md, /--auto-commit/);
  const worktreeIdx = md.indexOf('--worktree-per-bug');
  const nearbyText = md.slice(worktreeIdx, worktreeIdx + 400);
  assert.match(nearbyText, /default OFF/i);
});

test('bugfix-loop SKILL.md Step 3 calls adev worktree add --slug bugfix-<issue-id> --base <ref> before claim, when --worktree-per-bug is set (Plan-task 6)', () => {
  const addIdx = STEP3.indexOf('adev worktree add');
  const claimIdx = STEP3.indexOf('adev issues claim <id>');
  assert.ok(addIdx !== -1 && claimIdx !== -1, 'both calls must appear within Step 3');
  assert.ok(addIdx < claimIdx, 'worktree add must be documented within Step 3, before the claim call');
  assert.match(STEP3, /--slug bugfix-<issue-id>/);
  assert.match(STEP3, /--base <worktree_base_ref>|--base <ref>/);
});

test('bugfix-loop SKILL.md Step 3 documents ADD_FAILED handling: no attempt this turn, continue to Step 2 (Plan-task 6)', () => {
  assert.match(STEP3, /ADD_FAILED/);
  const addFailedIdx = STEP3.indexOf('ADD_FAILED');
  const nearbyText = STEP3.slice(addFailedIdx, addFailedIdx + 300);
  assert.match(nearbyText, /Step 2/);
});

test('bugfix-loop SKILL.md Step 6 calls adev worktree remove --slug bugfix-<issue-id> after commit (or explicit skip) is confirmed (Plan-task 7)', () => {
  assert.match(STEP6, /adev worktree remove --slug bugfix-<issue-id>/, 'worktree remove must be documented within Step 6');
});

test('bugfix-loop SKILL.md Step 6 documents REMOVE_FAILED as non-blocking advisory — never retried, never blocks self-re-invocation (Plan-task 7)', () => {
  assert.match(STEP6, /REMOVE_FAILED/);
  const idx = STEP6.indexOf('REMOVE_FAILED');
  const nearby = STEP6.slice(idx, idx + 300);
  assert.match(nearby, /non-blocking advisory/);
  assert.match(nearby, /[Nn]ever retr/);
});

test('the manual --resume path (no --resume-run-id) performs the same orphan-worktree sweep as Step 6 (BEH-13) (Plan-task 7)', () => {
  const manualResumeIdx = STEP0.indexOf('manual crash recovery');
  const manualResumeText = STEP0.slice(manualResumeIdx);
  assert.match(manualResumeText, /adev worktree remove --slug bugfix-<issue-id>/);
  assert.match(manualResumeText, /BEH-13/);
});

test('bugfix-loop SKILL.md documents WORKTREE_REMOVAL_DEFERRED: an uncommitted diff leaves the worktree in place, logging its path, instead of removing it (Plan-task 7)', () => {
  assert.match(STEP6, /WORKTREE_REMOVAL_DEFERRED/);
});

test('bugfix-loop SKILL.md has a Step 4.5 that calls adev bugfix-loop commit-pr on a FIXED verdict when --worktree-per-bug or --auto-commit is set (Plan-task 11)', () => {
  const step4Idx = FULL_STEPS.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const step45Idx = FULL_STEPS.indexOf('## Step 4.5: Commit and open a PR');
  const step5Idx = FULL_STEPS.indexOf('## Step 5: Finish');
  assert.ok(step4Idx !== -1 && step45Idx !== -1 && step5Idx !== -1);
  assert.ok(step4Idx < step45Idx && step45Idx < step5Idx, 'Step 4.5 must sit between Step 4 and Step 5');
  assert.match(STEP45, /adev bugfix-loop commit-pr/);
  assert.match(STEP45, /FIXED/);
  assert.match(STEP45, /--worktree-per-bug.*--auto-commit|--auto-commit.*--worktree-per-bug/);
});

test('bugfix-loop SKILL.md documents Step 4.5 is skipped entirely for PARKED/UNREPRODUCIBLE verdicts (BEH-5) (Plan-task 11)', () => {
  assert.match(STEP45, /PARKED.*UNREPRODUCIBLE|UNREPRODUCIBLE.*PARKED/);
  assert.match(STEP45, /skip/i);
  assert.match(STEP45, /BEH-5/);
});

test('bugfix-loop SKILL.md Step 4 computes --files-touched/--tests-added via git diff --stat immediately before record-attempt (Plan-task 13)', () => {
  const diffStatIdx = STEP4.indexOf('git diff --stat');
  const recordAttemptIdx = STEP4.indexOf('adev bugfix-loop record-attempt');
  assert.ok(diffStatIdx !== -1 && recordAttemptIdx !== -1 && diffStatIdx < recordAttemptIdx, 'git diff --stat must run before record-attempt');
  assert.match(STEP4, /--files-touched/);
  assert.match(STEP4, /--tests-added/);
  assert.match(STEP4, /--priority-bound/);
  assert.match(STEP4, /--verdict/);
});

test('bugfix-loop SKILL.md Step 5 reprints the full summary table before the ADEV-BUGFIXLOOP token (Plan-task 13)', () => {
  const tableIdx = STEP5.indexOf('summary_table');
  const tokenIdx = STEP5.indexOf('ADEV-BUGFIXLOOP: <token-from-result>');
  assert.ok(tableIdx !== -1 && tokenIdx !== -1 && tableIdx < tokenIdx, 'summary table reprint must come before the terminal token');
});

test('bugfix-loop SKILL.md documents --max-priority <P0-P4>, default P3, and rejects malformed values at Step 0 before bug selection (Plan-task 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--max-priority <P0-P4>/);
  const argsIdx = md.indexOf('## Arguments');
  const step0Idx = md.indexOf('## Step 0: Resolve the run');
  const argsText = md.slice(argsIdx, step0Idx);
  assert.match(argsText, /--max-priority/);
  assert.match(argsText, /Default: `P3`/);

  assert.match(STEP0, /--max-priority.*fail-fast validation/);
  assert.match(STEP0, /INVALID_PRIORITY_BOUND/);
  const validationIdx = STEP0.indexOf('fail-fast validation');
  const step2Idx = FULL_STEPS.indexOf('## Step 2: Select a bug');
  const step0IdxInFull = FULL_STEPS.indexOf('## Step 0: Resolve the run');
  assert.ok(step0IdxInFull + validationIdx < step2Idx, 'validation must happen before Step 2 bug selection');
});

test('bugfix-loop SKILL.md Step 2 uses the resolved --max-priority value instead of the literal P3 (Plan-task 14)', () => {
  assert.doesNotMatch(STEP2, /adev issues next --type bug --max-priority P3/);
  assert.match(STEP2, /adev issues next --type bug --max-priority <resolved-max-priority>/);
});

test('bugfix-loop SKILL.md Step 4 passes --priority-bound <resolved> to record-attempt (Plan-task 14)', () => {
  assert.match(STEP4, /record-attempt.*--priority-bound <resolved-max-priority>/);
});

test('bugfix-loop SKILL.md Step 2 documents stderr must not be redirected/suppressed so BEH-12 excluded-module output reaches the transcript (Plan-task 14)', () => {
  assert.match(STEP2, /stderr/);
  assert.match(STEP2, /BEH-12/);
});

test('every new bugfix-loop subverb (check-freshness, commit-pr) and skill arg (--worktree-per-bug, --auto-commit, --max-priority) appears in docs/cli-reference.md and/or docs/skill-reference.md (Plan-task 15)', () => {
  const cliDocs = read('docs/cli-reference.md');
  const skillDocs = read('docs/skill-reference.md');
  const combined = cliDocs + skillDocs;
  for (const term of ['check-freshness', 'commit-pr', '--worktree-per-bug', '--auto-commit', '--max-priority']) {
    assert.ok(combined.includes(term), `docs must mention "${term}" somewhere (cli-reference.md or skill-reference.md)`);
  }
});

test('using-adev gateway table lists /adev:bugfix-loop', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});

test('using-adev persona overlay names ADEV-BUGFIXLOOP as persona-exempt', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /ADEV-BUGFIXLOOP/);
});

test('work SKILL.md routing table lists /adev:bugfix-loop', () => {
  const md = readSkillSurface('work');
  assert.match(md, /\/adev:bugfix-loop/);
});
