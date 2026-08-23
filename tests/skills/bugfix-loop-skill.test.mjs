// tests/skills/bugfix-loop-skill.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 8, 10, 11
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;

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
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const tok of ['ADEV-BUGFIXLOOP: COMPLETE', 'ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED', 'ADEV-BUGFIXLOOP: BLOCKED']) {
    assert.ok(TOKEN_GRAMMAR.test(tok));
    assert.ok(md.includes(tok), `must instruct emitting "${tok}"`);
  }
  assert.match(md, /(final line|last line)/i);
});

test('bugfix-loop SKILL.md self-re-invokes via the Skill tool between non-terminal turns', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--resume --resume-run-id/);
  assert.match(md, /Skill tool/);
});

test('bugfix-loop SKILL.md reads the status guard before calling adev issues next (AC bullet 8)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const guardIdx = md.indexOf('bugfix-loop guard');
  const nextIdx = md.indexOf('issues next');
  assert.ok(guardIdx !== -1 && nextIdx !== -1 && guardIdx < nextIdx, 'guard must be called before issues next');
});

test('bugfix-loop SKILL.md bounds claim-failure retries to 3 within a turn (AC bullet 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /\b3\b[\s\S]{0,80}retr|retr[\s\S]{0,80}\b3\b/i);
});

test('bugfix-loop SKILL.md wires --github-sync to adev tracker-sync inbound/outbound (no longer fails fast)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev tracker-sync inbound/);
  assert.match(md, /adev tracker-sync outbound/);
  assert.doesNotMatch(md, /GitHub sync not available/);
});

test('bugfix-loop SKILL.md calls tracker-sync inbound before Step 2 bug selection', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const inboundIdx = md.indexOf('tracker-sync inbound');
  const step2Idx = md.indexOf('## Step 2: Select a bug');
  assert.ok(inboundIdx !== -1 && step2Idx !== -1 && inboundIdx < step2Idx, 'inbound sync must run before Step 2');
});

test('bugfix-loop SKILL.md calls tracker-sync outbound after the Step 4 attempt completes', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step4Idx = md.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const outboundIdx = md.indexOf('tracker-sync outbound');
  const step5Idx = md.indexOf('## Step 5: Finish');
  assert.ok(step4Idx !== -1 && outboundIdx !== -1 && step5Idx !== -1);
  assert.ok(step4Idx < outboundIdx && outboundIdx < step5Idx, 'outbound writeback must run within Step 4, before Step 5');
});

test('bugfix-loop SKILL.md Step 0/1 calls adev bugfix-loop check-freshness before the status/budget guard (Plan-task 3)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev bugfix-loop check-freshness/);
  const freshnessIdx = md.indexOf('adev bugfix-loop check-freshness');
  const guardIdx = md.indexOf('adev bugfix-loop guard');
  assert.ok(freshnessIdx !== -1 && guardIdx !== -1 && freshnessIdx < guardIdx, 'check-freshness must be called before the guard');
});

test('bugfix-loop SKILL.md documents BRANCH_STALE_BLOCKED halting before bug selection (Plan-task 3)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /BRANCH_STALE_BLOCKED/);
  assert.match(md, /FRESHNESS_CHECK_DEGRADED/);
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
  const md = read('skills/bugfix-loop/SKILL.md');
  const step3Idx = md.indexOf('## Step 3: Claim');
  const step4Idx = md.indexOf('## Step 4: Attempt');
  const step3Text = md.slice(step3Idx, step4Idx);
  const addIdx = step3Text.indexOf('adev worktree add');
  const claimIdx = step3Text.indexOf('adev issues claim <id>');
  assert.ok(step3Idx !== -1 && addIdx !== -1 && claimIdx !== -1, 'both calls must appear within Step 3');
  assert.ok(addIdx < claimIdx, 'worktree add must be documented within Step 3, before the claim call');
  assert.match(step3Text, /--slug bugfix-<issue-id>/);
  assert.match(step3Text, /--base <worktree_base_ref>|--base <ref>/);
});

test('bugfix-loop SKILL.md Step 3 documents ADD_FAILED handling: no attempt this turn, continue to Step 2 (Plan-task 6)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /ADD_FAILED/);
  const addFailedIdx = md.indexOf('ADD_FAILED');
  const nearbyText = md.slice(addFailedIdx, addFailedIdx + 300);
  assert.match(nearbyText, /Step 2/);
});

test('bugfix-loop SKILL.md Step 6 calls adev worktree remove --slug bugfix-<issue-id> after commit (or explicit skip) is confirmed (Plan-task 7)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step6Idx = md.indexOf('## Step 6: Self-re-invoke');
  const failureModesIdx = md.indexOf('## Failure Modes');
  const step6Text = md.slice(step6Idx, failureModesIdx);
  assert.ok(step6Idx !== -1 && failureModesIdx !== -1);
  assert.match(step6Text, /adev worktree remove --slug bugfix-<issue-id>/, 'worktree remove must be documented within Step 6');
});

test('bugfix-loop SKILL.md Step 6 documents REMOVE_FAILED as non-blocking advisory — never retried, never blocks self-re-invocation (Plan-task 7)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /REMOVE_FAILED/);
  const idx = md.indexOf('REMOVE_FAILED');
  const nearby = md.slice(idx, idx + 300);
  assert.match(nearby, /non-blocking advisory/);
  assert.match(nearby, /[Nn]ever retr/);
});

test('the manual --resume path (no --resume-run-id) performs the same orphan-worktree sweep as Step 6 (BEH-13) (Plan-task 7)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const manualResumeIdx = md.indexOf('manual crash recovery');
  const step1Idx = md.indexOf('## Step 1: Turn guard');
  const manualResumeText = md.slice(manualResumeIdx, step1Idx);
  assert.match(manualResumeText, /adev worktree remove --slug bugfix-<issue-id>/);
  assert.match(manualResumeText, /BEH-13/);
});

test('bugfix-loop SKILL.md documents WORKTREE_REMOVAL_DEFERRED: an uncommitted diff leaves the worktree in place, logging its path, instead of removing it (Plan-task 7)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /WORKTREE_REMOVAL_DEFERRED/);
});

test('bugfix-loop SKILL.md has a Step 4.5 that calls adev bugfix-loop commit-pr on a FIXED verdict when --worktree-per-bug or --auto-commit is set (Plan-task 11)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step4Idx = md.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const step45Idx = md.indexOf('## Step 4.5: Commit and open a PR');
  const step5Idx = md.indexOf('## Step 5: Finish');
  assert.ok(step4Idx !== -1 && step45Idx !== -1 && step5Idx !== -1);
  assert.ok(step4Idx < step45Idx && step45Idx < step5Idx, 'Step 4.5 must sit between Step 4 and Step 5');
  const step45Text = md.slice(step45Idx, step5Idx);
  assert.match(step45Text, /adev bugfix-loop commit-pr/);
  assert.match(step45Text, /FIXED/);
  assert.match(step45Text, /--worktree-per-bug.*--auto-commit|--auto-commit.*--worktree-per-bug/);
});

test('bugfix-loop SKILL.md documents Step 4.5 is skipped entirely for PARKED/UNREPRODUCIBLE verdicts (BEH-5) (Plan-task 11)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step45Idx = md.indexOf('## Step 4.5: Commit and open a PR');
  const step5Idx = md.indexOf('## Step 5: Finish');
  const step45Text = md.slice(step45Idx, step5Idx);
  assert.match(step45Text, /PARKED.*UNREPRODUCIBLE|UNREPRODUCIBLE.*PARKED/);
  assert.match(step45Text, /skip/i);
  assert.match(step45Text, /BEH-5/);
});

test('bugfix-loop SKILL.md Step 4 computes --files-touched/--tests-added via git diff --stat immediately before record-attempt (Plan-task 13)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step4Idx = md.indexOf('## Step 4: Attempt via /adev:debug --auto');
  const step45Idx = md.indexOf('## Step 4.5: Commit and open a PR');
  const step4Text = md.slice(step4Idx, step45Idx);
  const diffStatIdx = step4Text.indexOf('git diff --stat');
  const recordAttemptIdx = step4Text.indexOf('adev bugfix-loop record-attempt');
  assert.ok(diffStatIdx !== -1 && recordAttemptIdx !== -1 && diffStatIdx < recordAttemptIdx, 'git diff --stat must run before record-attempt');
  assert.match(step4Text, /--files-touched/);
  assert.match(step4Text, /--tests-added/);
  assert.match(step4Text, /--priority-bound/);
  assert.match(step4Text, /--verdict/);
});

test('bugfix-loop SKILL.md Step 5 reprints the full summary table before the ADEV-BUGFIXLOOP token (Plan-task 13)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step5Idx = md.indexOf('## Step 5: Finish');
  const step6Idx = md.indexOf('## Step 6: Self-re-invoke');
  const step5Text = md.slice(step5Idx, step6Idx);
  const tableIdx = step5Text.indexOf('summary_table');
  const tokenIdx = step5Text.indexOf('ADEV-BUGFIXLOOP: <token-from-result>');
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

  const step1Idx = md.indexOf('## Step 1: Turn guard');
  const step0Text = md.slice(step0Idx, step1Idx);
  assert.match(step0Text, /--max-priority.*fail-fast validation/);
  assert.match(step0Text, /INVALID_PRIORITY_BOUND/);
  const validationIdx = step0Text.indexOf('fail-fast validation');
  const step2Idx = md.indexOf('## Step 2: Select a bug');
  assert.ok(step0Idx + validationIdx < step2Idx, 'validation must happen before Step 2 bug selection');
});

test('bugfix-loop SKILL.md Step 2 uses the resolved --max-priority value instead of the literal P3 (Plan-task 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.doesNotMatch(md, /adev issues next --type bug --max-priority P3/);
  const step2Idx = md.indexOf('## Step 2: Select a bug');
  const step3Idx = md.indexOf('## Step 3: Claim');
  const step2Text = md.slice(step2Idx, step3Idx);
  assert.match(step2Text, /adev issues next --type bug --max-priority <resolved-max-priority>/);
});

test('bugfix-loop SKILL.md Step 4 passes --priority-bound <resolved> to record-attempt (Plan-task 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /record-attempt.*--priority-bound <resolved-max-priority>/);
});

test('bugfix-loop SKILL.md Step 2 documents stderr must not be redirected/suppressed so BEH-12 excluded-module output reaches the transcript (Plan-task 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const step2Idx = md.indexOf('## Step 2: Select a bug');
  const step3Idx = md.indexOf('## Step 3: Claim');
  const step2Text = md.slice(step2Idx, step3Idx);
  assert.match(step2Text, /stderr/);
  assert.match(step2Text, /BEH-12/);
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
  const md = read('skills/work/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});
