// tests/lib/tracker-sync-links.test.mjs
//
// Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
// Plan-task: 5
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLink, findByExternalRef, findByLocalIssueId, updateLinkSyncState, resolveLinksLogPath } from '../../lib/tracker-sync-links.mjs';

function tmpProjectRoot() {
  return mkdtempSync(join(tmpdir(), 'tsl-'));
}

test('createLink persists a link with no provider field', () => {
  const projectRoot = tmpProjectRoot();
  const link = createLink(projectRoot, { externalRef: 'github:42', localIssueId: 'i1' });
  assert.strictEqual(link.provider, undefined);
  assert.strictEqual(link.external_ref, 'github:42');
  assert.strictEqual(link.local_issue_id, 'i1');
  assert.ok(link.accepted_at);
  assert.strictEqual(link.last_synced_at, null);
  assert.strictEqual(link.last_comment_id, null);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('createLink is idempotent — a second call for the same external_ref returns the existing link, no duplicate', () => {
  const projectRoot = tmpProjectRoot();
  const first = createLink(projectRoot, { externalRef: 'github:42', localIssueId: 'i1' });
  const second = createLink(projectRoot, { externalRef: 'github:42', localIssueId: 'i1' });
  assert.strictEqual(first.local_issue_id, second.local_issue_id);
  assert.strictEqual(findByExternalRef(projectRoot, 'github:42').accepted_at, first.accepted_at);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('findByExternalRef returns null for an unknown ref', () => {
  const projectRoot = tmpProjectRoot();
  assert.strictEqual(findByExternalRef(projectRoot, 'github:999'), null);
  rmSync(projectRoot, { recursive: true, force: true });
});

test('findByLocalIssueId returns the link for a known local issue id', () => {
  const projectRoot = tmpProjectRoot();
  createLink(projectRoot, { externalRef: 'github:8', localIssueId: 'i8' });
  const link = findByLocalIssueId(projectRoot, 'i8');
  assert.strictEqual(link.external_ref, 'github:8');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('updateLinkSyncState updates last_synced_at/last_comment_id, read back by findByLocalIssueId', () => {
  const projectRoot = tmpProjectRoot();
  createLink(projectRoot, { externalRef: 'github:7', localIssueId: 'i2' });
  updateLinkSyncState(projectRoot, { externalRef: 'github:7', lastSyncedAt: '2026-08-19T00:00:00Z', lastCommentId: 'c1' });
  const link = findByLocalIssueId(projectRoot, 'i2');
  assert.strictEqual(link.last_comment_id, 'c1');
  assert.strictEqual(link.last_synced_at, '2026-08-19T00:00:00Z');
  rmSync(projectRoot, { recursive: true, force: true });
});

test('resolveLinksLogPath points at .context-index/lifecycle-state/tracker-sync-links.jsonl', () => {
  const projectRoot = tmpProjectRoot();
  const p = resolveLinksLogPath(projectRoot);
  assert.ok(p.endsWith(join('.context-index', 'lifecycle-state', 'tracker-sync-links.jsonl')));
  rmSync(projectRoot, { recursive: true, force: true });
});
