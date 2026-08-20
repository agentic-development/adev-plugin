// tests/lib/tracker-provider-bridge-inbound.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 7
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInboundSync } from '../../lib/tracker-provider-bridge/inbound-sync.mjs';
import { registerForTest } from '../../lib/provider/tracker-provider-registry.mjs';
import { createRun, readRunState } from '../../lib/bugfix-loop-run.mjs';
import { getIssueManager } from '../../lib/issues/registry.mjs';
import { createLink } from '../../lib/tracker-sync-links.mjs';
import { recordDebugAttempt } from '../../lib/bugfix-loop-attempts.mjs';

function fixtureBoard() {
  const projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tpb-inbound-')));
  mkdirSync(join(projectRoot, '.context-index'), { recursive: true });
  writeFileSync(
    join(projectRoot, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  backend: json\n',
  );
  const manifest = { tasks: { backend: 'json', bugfix_loop: {} } };
  const issueManager = getIssueManager(manifest, projectRoot);
  return { projectRoot, manifest, issueManager };
}

test('creates exactly one WorkItem + TrackerSyncLink per new gated issue, with affected_modules: []', async () => {
  const { projectRoot, manifest, issueManager } = fixtureBoard();
  const stubAdapter = {
    gateCheck: async () => ({ available: true, items: [{ number: 1, title: 't', body: 'b', labels: ['bug', 'help wanted'] }] }),
    fetchGated: async () => ({ refused: false, collided: false, title: 't', notes: '<<<ADEV-PACK-x role="untrusted-github-issue">>>\nb\n<<<END-ADEV-PACK-x>>>', type: 'bug', affected_modules: [] }),
    postComment: async () => ({ posted: true }),
  };
  registerForTest('stub-inbound-1', stubAdapter);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-inbound-1';
  const { run_id: runId } = createRun(projectRoot, {});

  const result = await runInboundSync({ projectRoot, manifest, runId });

  const items = await issueManager.list({});
  const bugs = items.filter((i) => i.type === 'bug');
  assert.strictEqual(bugs.length, 1);
  assert.deepStrictEqual(bugs[0].affected_modules, []);
  assert.strictEqual(result.linked, 1);
  assert.strictEqual(result.degraded, false);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('already-linked gated issue is a no-op — no duplicate WorkItem on re-run', async () => {
  const { projectRoot, manifest, issueManager } = fixtureBoard();
  const stubAdapter = {
    gateCheck: async () => ({ available: true, items: [{ number: 2, title: 't2', body: 'b2', labels: ['bug', 'help wanted'] }] }),
    fetchGated: async () => ({ refused: false, collided: false, title: 't2', notes: 'fenced-body', type: 'bug', affected_modules: [] }),
    postComment: async () => ({ posted: true }),
  };
  registerForTest('stub-inbound-2', stubAdapter);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-inbound-2';
  const { run_id: runId } = createRun(projectRoot, {});

  await runInboundSync({ projectRoot, manifest, runId });
  await runInboundSync({ projectRoot, manifest, runId });

  const items = await issueManager.list({});
  assert.strictEqual(items.filter((i) => i.type === 'bug').length, 1);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('UNKNOWN_TRACKER_PROVIDER degrades to empty candidates, does not throw', async () => {
  const { projectRoot, manifest } = fixtureBoard();
  manifest.tasks.bugfix_loop.tracker_provider = 'nonexistent-provider-abc';
  const { run_id: runId } = createRun(projectRoot, {});
  const result = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(result.degraded, true);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('a registered provider whose gateCheck() reports available:false (gh unreachable) degrades and increments the retry counter', async () => {
  const { projectRoot, manifest } = fixtureBoard();
  const stubUnreachable = {
    gateCheck: async () => ({ available: false, items: [] }),
    fetchGated: async () => ({}),
    postComment: async () => ({ posted: false }),
  };
  registerForTest('stub-unreachable-1', stubUnreachable);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-unreachable-1';
  const { run_id: runId } = createRun(projectRoot, {});
  const result = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(result.degraded, true);
  assert.strictEqual(result.reason, 'gh_unreachable');
  const state = readRunState(projectRoot, runId);
  assert.strictEqual(state.sync_retry_counts.unreachable_consecutive_turns, 1);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('after 5 consecutive unreachable turns, degraded_sync_note is set and gateCheck is no longer called', async () => {
  const { projectRoot, manifest } = fixtureBoard();
  let gateCheckCalls = 0;
  const stubUnreachable = {
    gateCheck: async () => { gateCheckCalls += 1; return { available: false, items: [] }; },
    fetchGated: async () => ({}),
    postComment: async () => ({ posted: false }),
  };
  registerForTest('stub-unreachable-2', stubUnreachable);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-unreachable-2';
  const { run_id: runId } = createRun(projectRoot, {});

  for (let i = 0; i < 5; i++) await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(gateCheckCalls, 5);
  assert.ok(readRunState(projectRoot, runId).degraded_sync_note);

  // 6th call must NOT invoke gateCheck at all.
  const result = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(gateCheckCalls, 5);
  assert.strictEqual(result.degraded, true);
  assert.strictEqual(result.reason, 'already_degraded');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('an oversized issue is refused (not truncated) and excluded from candidates after 5 consecutive oversized turns', async () => {
  const { projectRoot, manifest, issueManager } = fixtureBoard();
  let fetchGatedCalls = 0;
  const stubOversized = {
    gateCheck: async () => ({ available: true, items: [{ number: 77, title: 'x'.repeat(300), body: 'b', labels: ['bug', 'help wanted'] }] }),
    fetchGated: async () => { fetchGatedCalls += 1; return { refused: true, reason: 'title exceeds 200 chars' }; },
    postComment: async () => ({ posted: true }),
  };
  registerForTest('stub-oversized-1', stubOversized);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-oversized-1';
  const { run_id: runId } = createRun(projectRoot, {});

  for (let i = 0; i < 5; i++) await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(fetchGatedCalls, 5);
  const state = readRunState(projectRoot, runId);
  assert.strictEqual(state.sync_retry_counts.oversized_consecutive_turns[77], 5);

  // 6th turn: excluded outright, no further fetchGated call for issue 77.
  await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(fetchGatedCalls, 5);

  const items = await issueManager.list({});
  assert.strictEqual(items.filter((i) => i.type === 'bug').length, 0);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('stale-link notice fires once per external ref per run — not on a second call within the same run', async () => {
  const { projectRoot, manifest } = fixtureBoard();
  createLink(projectRoot, { externalRef: 'github:55', localIssueId: 'issue-55' });
  // Backdate accepted_at by rewriting the link directly is out of scope here;
  // instead exercise the notice path via a manifest stale-days of 0 so "now"
  // already exceeds the threshold regardless of accepted_at's exact value.
  manifest.tasks.bugfix_loop.tracker_link_stale_days = 0;
  const stub = {
    gateCheck: async () => ({ available: true, items: [{ number: 55, title: 't', body: 'b', labels: ['bug', 'help wanted'] }] }),
    fetchGated: async () => ({ refused: false, collided: false, title: 't', notes: 'n', type: 'bug', affected_modules: [] }),
    postComment: async () => ({ posted: true }),
  };
  registerForTest('stub-stale-1', stub);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-stale-1';
  const { run_id: runId } = createRun(projectRoot, {});

  const first = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(first.notices.length, 1);
  assert.match(first.notices[0], /stale tracker link/);

  const second = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(second.notices.length, 0);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('stale-link notice does not fire once an AttemptRecord exists for the linked WorkItem', async () => {
  const { projectRoot, manifest } = fixtureBoard();
  createLink(projectRoot, { externalRef: 'github:56', localIssueId: 'issue-56' });
  recordDebugAttempt(projectRoot, manifest, { issueId: 'issue-56', outcome: 'PARKED', checkIds: ['cq-1'] });
  manifest.tasks.bugfix_loop.tracker_link_stale_days = 0;
  const stub = {
    gateCheck: async () => ({ available: true, items: [{ number: 56, title: 't', body: 'b', labels: ['bug', 'help wanted'] }] }),
    fetchGated: async () => ({ refused: false, collided: false, title: 't', notes: 'n', type: 'bug', affected_modules: [] }),
    postComment: async () => ({ posted: true }),
  };
  registerForTest('stub-stale-2', stub);
  manifest.tasks.bugfix_loop.tracker_provider = 'stub-stale-2';
  const { run_id: runId } = createRun(projectRoot, {});

  const result = await runInboundSync({ projectRoot, manifest, runId });
  assert.strictEqual(result.notices.length, 0);
  rmSync(projectRoot, { recursive: true, force: true });
});
