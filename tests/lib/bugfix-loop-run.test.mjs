// tests/lib/bugfix-loop-run.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
// Plan-task: 1
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRun, readRunState, resolveRunStatePath, checkStatusGuard, checkBudget } from '../../lib/bugfix-loop-run.mjs';

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
