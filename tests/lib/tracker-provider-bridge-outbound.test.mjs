// tests/lib/tracker-provider-bridge-outbound.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 8
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runOutboundWriteback } from '../../lib/tracker-provider-bridge/outbound-writeback.mjs';
import { registerForTest } from '../../lib/provider/tracker-provider-registry.mjs';
import { createLink, findByExternalRef } from '../../lib/tracker-sync-links.mjs';

function fixtureRoot() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'tpb-outbound-')));
}

test('posts exactly one comment per attempt, skips a duplicate re-invocation for the same completedAt', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'stub-outbound-1' } } };
  let postCount = 0;
  const stub = {
    gateCheck: async () => ({ available: true, items: [] }),
    fetchGated: async () => ({}),
    postComment: async () => { postCount += 1; return { posted: true, commentId: 'c1' }; },
  };
  registerForTest('stub-outbound-1', stub);
  createLink(projectRoot, { externalRef: 'github:5', localIssueId: 'i5' });

  const completedAt = '2026-08-19T00:00:00Z';
  const first = await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i5', verdict: 'FIXED', completedAt });
  const second = await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i5', verdict: 'FIXED', completedAt });

  assert.strictEqual(postCount, 1);
  assert.strictEqual(first.posted, true);
  assert.strictEqual(second.posted, false);
  assert.strictEqual(second.reason, 'already_posted');
  assert.strictEqual(second.commentId, 'c1');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('no-op when the WorkItem has no TrackerSyncLink', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'github' } } };
  const result = await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'unlinked', verdict: 'PARKED', completedAt: new Date().toISOString() });
  assert.strictEqual(result.posted, false);
  assert.strictEqual(result.reason, 'no_link');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('updates last_synced_at/last_comment_id on a successful post', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'stub-outbound-2' } } };
  const stub = {
    gateCheck: async () => ({ available: true, items: [] }),
    fetchGated: async () => ({}),
    postComment: async () => ({ posted: true, commentId: 'c99' }),
  };
  registerForTest('stub-outbound-2', stub);
  createLink(projectRoot, { externalRef: 'github:6', localIssueId: 'i6' });

  const completedAt = '2026-08-19T01:00:00Z';
  await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i6', verdict: 'UNREPRODUCIBLE', completedAt });

  const link = findByExternalRef(projectRoot, 'github:6');
  assert.strictEqual(link.last_comment_id, 'c99');
  assert.strictEqual(link.last_synced_at, completedAt);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('never calls anything other than postComment — no issue-state/label/assignee mutation call exists on this path', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'stub-outbound-3' } } };
  const calls = [];
  const stub = {
    gateCheck: async () => { calls.push('gateCheck'); return { available: true, items: [] }; },
    fetchGated: async () => { calls.push('fetchGated'); return {}; },
    postComment: async () => { calls.push('postComment'); return { posted: true, commentId: 'c1' }; },
  };
  registerForTest('stub-outbound-3', stub);
  createLink(projectRoot, { externalRef: 'github:9', localIssueId: 'i9' });
  await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i9', verdict: 'PARKED', completedAt: new Date().toISOString() });
  assert.deepStrictEqual(calls, ['postComment']);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('degrades to posted:false when the configured provider is unregistered', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'nonexistent-outbound-provider' } } };
  createLink(projectRoot, { externalRef: 'github:10', localIssueId: 'i10' });
  const result = await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i10', verdict: 'FIXED', completedAt: new Date().toISOString() });
  assert.strictEqual(result.posted, false);
  assert.strictEqual(result.reason, 'unavailable');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('logs a failed post as posted:false without throwing', async () => {
  const projectRoot = fixtureRoot();
  const manifest = { tasks: { bugfix_loop: { tracker_provider: 'stub-outbound-4' } } };
  const stub = {
    gateCheck: async () => ({ available: true, items: [] }),
    fetchGated: async () => ({}),
    postComment: async () => ({ posted: false }),
  };
  registerForTest('stub-outbound-4', stub);
  createLink(projectRoot, { externalRef: 'github:11', localIssueId: 'i11' });
  const result = await runOutboundWriteback({ projectRoot, manifest, localIssueId: 'i11', verdict: 'FIXED', completedAt: new Date().toISOString() });
  assert.strictEqual(result.posted, false);
  assert.strictEqual(result.reason, 'post_failed');
  rmSync(projectRoot, { recursive: true, force: true });
});
