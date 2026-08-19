// Spec: .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readAttemptRecord,
  resolveAttemptsLogPath,
  resolveAttemptCap,
  computeDegradedBlockerHash,
  recordDebugAttempt,
} from '../../lib/bugfix-loop-attempts.mjs';

test('readAttemptRecord returns null when no record exists for the issue (BEH-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  mkdirSync(join(root, '.context-index'), { recursive: true });
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});

test('readAttemptRecord fails open (treats as zero attempts) when the log file is corrupted', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const logPath = resolveAttemptsLogPath(root);
  mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
  writeFileSync(logPath, 'not valid json\n{"issue_id":"issue-1"\n');
  assert.equal(readAttemptRecord(root, 'issue-1'), null);
  rmSync(root, { recursive: true, force: true });
});

test('resolveAttemptCap defaults to 2 when tasks.bugfix_loop.attempt_cap is unset', () => {
  assert.equal(resolveAttemptCap({}), 2);
  assert.equal(resolveAttemptCap(undefined), 2);
});

test('resolveAttemptCap reads tasks.bugfix_loop.attempt_cap when present', () => {
  assert.equal(resolveAttemptCap({ tasks: { bugfix_loop: { attempt_cap: 5 } } }), 5);
});

test('computeDegradedBlockerHash returns 8 lowercase hex chars, matching lib/blocker-id.mjs convention', () => {
  const hash = computeDegradedBlockerHash('some raw quality-gate failure output');
  assert.match(hash, /^[0-9a-f]{8}$/);
});

test('computeDegradedBlockerHash is stable for identical input and differs for different input', () => {
  const a = computeDegradedBlockerHash('failure output A');
  const b = computeDegradedBlockerHash('failure output A');
  const c = computeDegradedBlockerHash('failure output B');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('recordDebugAttempt: FIXED increments attempts and sets last_verdict PASS (BEH-1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const rec = recordDebugAttempt(root, {}, { issueId: 'issue-1', outcome: 'FIXED' });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'PASS');
  assert.deepEqual(readAttemptRecord(root, 'issue-1'), rec);
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: UNREPRODUCIBLE sets BUDGET_EXHAUSTED immediately with parked_reason (BEH-3)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const rec = recordDebugAttempt(root, {}, { issueId: 'issue-1', outcome: 'UNREPRODUCIBLE' });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'BUDGET_EXHAUSTED');
  assert.equal(rec.parked_reason, 'does not reproduce');
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED with no prior record computes CONTINUE via loop-convergence, unconditionally (BEH-2, BEH-5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 3 } } };
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    checkIds: ['test-a', 'test-b'],
  });
  assert.equal(rec.attempts, 1);
  assert.equal(rec.last_verdict, 'CONTINUE');
  assert.deepEqual(rec.curr_blockers.sort(), ['test-a', 'test-b']);
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED with cap=1 on first attempt yields BUDGET_EXHAUSTED, not unset (BEH-2 unconditional call)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 1 } } };
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    checkIds: ['test-a'],
  });
  assert.equal(rec.last_verdict, 'BUDGET_EXHAUSTED');
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED persistent blockers across two attempts yields NO_PROGRESS (BEH-6, write-read round trip)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = { tasks: { bugfix_loop: { attempt_cap: 5 } } };
  recordDebugAttempt(root, manifest, { issueId: 'issue-1', outcome: 'PARKED', checkIds: ['test-a'] });
  const prior = readAttemptRecord(root, 'issue-1');
  assert.deepEqual(prior.curr_blockers, ['test-a']); // read-back as next attempt's prev_blockers
  const rec2 = recordDebugAttempt(root, manifest, { issueId: 'issue-1', outcome: 'PARKED', checkIds: ['test-a'] });
  assert.equal(rec2.last_verdict, 'NO_PROGRESS');
  rmSync(root, { recursive: true, force: true });
});

test('recordDebugAttempt: PARKED without stable check IDs falls back to bounded hash (Error Cases row 1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'attempts-'));
  const manifest = {};
  const rec = recordDebugAttempt(root, manifest, {
    issueId: 'issue-1',
    outcome: 'PARKED',
    rawOutput: 'raw stdout with no discrete check ids',
  });
  assert.equal(rec.curr_blockers.length, 1);
  assert.match(rec.curr_blockers[0], /^[0-9a-f]{8}$/);
  rmSync(root, { recursive: true, force: true });
});
