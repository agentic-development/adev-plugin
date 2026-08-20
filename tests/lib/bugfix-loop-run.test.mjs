// tests/lib/bugfix-loop-run.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 1
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  createRun, readRunState, resolveRunStatePath, checkStatusGuard, checkBudget,
  appendAttempt, completeTurn, finishRun, tokenForStatus, findLatestRunState,
  recordSyncRetry, resetSyncRetry, recordStaleLinkNotice, hasStaleLinkNoticeFired,
} from '../../lib/bugfix-loop-run.mjs';

test('createRun writes a run-state file with all BugfixLoopRun fields, defaults intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, { maxBugs: 5, maxTurns: 10 });
  assert.match(state.run_id, /^[0-9a-f-]{36}$/i);
  assert.equal(state.status, 'running');
  assert.deepEqual(state.bugs_attempted, []);
  assert.equal(state.turns_completed, 0);
  assert.equal(state.degraded_sync_note, null);
  assert.deepEqual(state.sync_retry_counts, { unreachable_consecutive_turns: 0, oversized_consecutive_turns: {} });
  assert.deepEqual(readRunState(root, state.run_id), state);
  rmSync(root, { recursive: true, force: true });
});

test('resolveRunStatePath rejects a non-UUID-shaped run_id (BD-1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  assert.throws(() => resolveRunStatePath(root, '../../etc/passwd'), /INVALID_RUN_ID/);
  assert.throws(() => resolveRunStatePath(root, 'not-a-uuid'), /INVALID_RUN_ID/);
  rmSync(root, { recursive: true, force: true });
});

test('run-state filename stays covered by the .gitignore lifecycle-state/*.json glob', () => {
  const root = process.cwd();
  const path = resolveRunStatePath(root, '11111111-1111-4111-8111-111111111111');
  const rel = path.slice(root.length + 1);
  const out = execSync(`git check-ignore ${rel}`, { cwd: root }).toString().trim();
  assert.equal(out, rel);
});

test('checkStatusGuard: refuses when status is not running', () => {
  assert.deepEqual(checkStatusGuard({ status: 'running' }), { ok: true });
  assert.deepEqual(checkStatusGuard({ status: 'complete' }), { ok: false, status: 'complete' });
  assert.deepEqual(checkStatusGuard({ status: 'blocked' }), { ok: false, status: 'blocked' });
});

test('checkBudget: exhausted on max_bugs reached (AC bullet 3)', () => {
  const state = { max_bugs: 2, max_turns: null, bugs_attempted: [{}, {}], turns_completed: 0 };
  assert.deepEqual(checkBudget(state), { exhausted: true, reason: 'max_bugs' });
});

test('checkBudget: exhausted on turns_completed reaching max_turns, independent of bugs_attempted (AC bullet 4)', () => {
  const state = { max_bugs: null, max_turns: 5, bugs_attempted: [], turns_completed: 5 };
  assert.deepEqual(checkBudget(state), { exhausted: true, reason: 'max_turns' });
});

test('checkBudget: not exhausted when neither cap is hit', () => {
  const state = { max_bugs: 5, max_turns: 20, bugs_attempted: [{}], turns_completed: 1 };
  assert.deepEqual(checkBudget(state), { exhausted: false, reason: null });
});

test('appendAttempt appends to bugs_attempted[] without touching turns_completed', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, { maxBugs: null, maxTurns: 20 });
  const updated = appendAttempt(root, state.run_id, 'issue-1');
  assert.equal(updated.bugs_attempted.length, 1);
  assert.equal(updated.bugs_attempted[0].issue_id, 'issue-1');
  assert.equal(updated.turns_completed, 0);
  rmSync(root, { recursive: true, force: true });
});

test('completeTurn increments turns_completed by exactly 1, every call', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  completeTurn(root, state.run_id);
  const after = completeTurn(root, state.run_id);
  assert.equal(after.turns_completed, 2);
  rmSync(root, { recursive: true, force: true });
});

test('finishRun writes the matching terminal status and returns the pinned token (AC bullet 7)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  const { state: finished, token } = finishRun(root, state.run_id, { status: 'budget_exhausted' });
  assert.equal(finished.status, 'budget_exhausted');
  assert.equal(token, 'BUDGET_EXHAUSTED');
  assert.equal(readRunState(root, state.run_id).status, 'budget_exhausted');
  rmSync(root, { recursive: true, force: true });
});

test('finishRun rejects a non-terminal status', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  assert.throws(() => finishRun(root, state.run_id, { status: 'running' }), /INVALID_TERMINAL_STATUS/);
  rmSync(root, { recursive: true, force: true });
});

test('finishRun: complete status persists before the COMPLETE token is returned (AC bullet 8 — round-1 plan-review fix: the prior draft only covered budget_exhausted here and blocked in Task 5, never complete)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  const { state: finished, token } = finishRun(root, state.run_id, { status: 'complete' });
  assert.equal(finished.status, 'complete');
  assert.equal(token, 'COMPLETE');
  assert.equal(readRunState(root, state.run_id).status, 'complete');
  rmSync(root, { recursive: true, force: true });
});

test('tokenForStatus maps all three terminal statuses (AC bullet 7)', () => {
  assert.equal(tokenForStatus('complete'), 'COMPLETE');
  assert.equal(tokenForStatus('budget_exhausted'), 'BUDGET_EXHAUSTED');
  assert.equal(tokenForStatus('blocked'), 'BLOCKED');
});

test('findLatestRunState returns the most-recently-modified valid run (BD-2 happy path)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const older = createRun(root, {});
  completeTurn(root, older.run_id); // touch mtime, still older than the next create
  const newer = createRun(root, {});
  const found = findLatestRunState(root);
  assert.equal(found.run_id, newer.run_id);
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState skips a candidate whose filename run_id does not match its own run_id field (BD-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const good = createRun(root, {});
  const dir = join(root, '.context-index', 'lifecycle-state');
  const foreignId = '22222222-2222-4222-8222-222222222222';
  writeFileSync(
    join(dir, `bugfix-loop-runs-${foreignId}.json`),
    JSON.stringify({ run_id: 'mismatched-id', status: 'running' }),
  );
  const found = findLatestRunState(root);
  assert.equal(found.run_id, good.run_id); // foreign/mismatched file skipped, good one found instead
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState skips a candidate with a status outside the charter enum (BD-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const good = createRun(root, {});
  const dir = join(root, '.context-index', 'lifecycle-state');
  const badId = '33333333-3333-4333-8333-333333333333';
  writeFileSync(join(dir, `bugfix-loop-runs-${badId}.json`), JSON.stringify({ run_id: badId, status: 'not-a-real-status' }));
  const found = findLatestRunState(root);
  assert.equal(found.run_id, good.run_id);
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState returns null when no run-state files exist', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
  assert.equal(findLatestRunState(root), null);
  rmSync(root, { recursive: true, force: true });
});

test('createRun initializes stale_link_notices_surfaced to [] (Plan-task 6)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  assert.deepEqual(state.stale_link_notices_surfaced, []);
  rmSync(root, { recursive: true, force: true });
});

test('recordSyncRetry increments unreachable_consecutive_turns and sets degraded_sync_note on the 5th', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id } = createRun(root, {});
  for (let i = 0; i < 4; i++) recordSyncRetry(root, run_id, { kind: 'unreachable' });
  let state = readRunState(root, run_id);
  assert.equal(state.degraded_sync_note, null);
  assert.equal(state.sync_retry_counts.unreachable_consecutive_turns, 4);
  recordSyncRetry(root, run_id, { kind: 'unreachable' });
  state = readRunState(root, run_id);
  assert.equal(state.sync_retry_counts.unreachable_consecutive_turns, 5);
  assert.ok(state.degraded_sync_note);
  rmSync(root, { recursive: true, force: true });
});

test('resetSyncRetry resets unreachable_consecutive_turns to 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id } = createRun(root, {});
  recordSyncRetry(root, run_id, { kind: 'unreachable' });
  recordSyncRetry(root, run_id, { kind: 'unreachable' });
  resetSyncRetry(root, run_id, { kind: 'unreachable' });
  const state = readRunState(root, run_id);
  assert.equal(state.sync_retry_counts.unreachable_consecutive_turns, 0);
  rmSync(root, { recursive: true, force: true });
});

test('recordSyncRetry with kind:oversized increments a per-issue-number map entry, independent of the unreachable counter', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id } = createRun(root, {});
  recordSyncRetry(root, run_id, { kind: 'oversized', issueNumber: 12 });
  recordSyncRetry(root, run_id, { kind: 'oversized', issueNumber: 12 });
  recordSyncRetry(root, run_id, { kind: 'oversized', issueNumber: 99 });
  const state = readRunState(root, run_id);
  assert.equal(state.sync_retry_counts.oversized_consecutive_turns[12], 2);
  assert.equal(state.sync_retry_counts.oversized_consecutive_turns[99], 1);
  assert.equal(state.sync_retry_counts.unreachable_consecutive_turns, 0);
  rmSync(root, { recursive: true, force: true });
});

test('resetSyncRetry with kind:oversized deletes that issue number entry from the map', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id } = createRun(root, {});
  recordSyncRetry(root, run_id, { kind: 'oversized', issueNumber: 5 });
  resetSyncRetry(root, run_id, { kind: 'oversized', issueNumber: 5 });
  const state = readRunState(root, run_id);
  assert.equal(state.sync_retry_counts.oversized_consecutive_turns[5], undefined);
  rmSync(root, { recursive: true, force: true });
});

test('recordStaleLinkNotice fires once per external ref per run; hasStaleLinkNoticeFired reflects it', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id } = createRun(root, {});
  assert.equal(hasStaleLinkNoticeFired(root, run_id, 'github:9'), false);
  recordStaleLinkNotice(root, run_id, 'github:9');
  assert.equal(hasStaleLinkNoticeFired(root, run_id, 'github:9'), true);
  const state = readRunState(root, run_id);
  assert.deepEqual(state.stale_link_notices_surfaced, ['github:9']);
  // Second call is a no-op — no duplicate entry.
  recordStaleLinkNotice(root, run_id, 'github:9');
  const state2 = readRunState(root, run_id);
  assert.deepEqual(state2.stale_link_notices_surfaced, ['github:9']);
  rmSync(root, { recursive: true, force: true });
});

test('a fresh run_id starts stale_link_notices_surfaced empty (fresh-per-run scope)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const { run_id: run1 } = createRun(root, {});
  recordStaleLinkNotice(root, run1, 'github:1');
  const { run_id: run2 } = createRun(root, {});
  assert.equal(hasStaleLinkNoticeFired(root, run2, 'github:1'), false);
  rmSync(root, { recursive: true, force: true });
});
