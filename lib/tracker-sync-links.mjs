/**
 * `TrackerSyncLink` persistence — provider-agnostic entity mapping one
 * external tracker issue to one local WorkItem.
 *
 * Owns the append-only JSONL event log at
 * `.context-index/lifecycle-state/tracker-sync-links.jsonl`, fold-on-read by
 * `external_ref` (last valid line wins), mirroring
 * `lib/bugfix-loop-attempts.mjs`'s append/fold pattern. Registered in
 * ADR-0015's Decision-section table.
 *
 * Carries no `provider` field (revision 11, round-9 review wiring-reviewer
 * WR-1) — adapter resolution for both inbound and outbound sync reads
 * `tasks.bugfix_loop.tracker_provider` directly via `TrackerProviderRegistry`,
 * so a per-link provenance field would have no consumer.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 5
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/tracker-sync-links
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Resolve the absolute path to the tracker-sync-links JSONL log.
 * @param {string} projectRoot
 * @returns {string}
 */
export function resolveLinksLogPath(projectRoot) {
  return join(projectRoot, '.context-index', 'lifecycle-state', 'tracker-sync-links.jsonl');
}

/**
 * Fold the JSONL log by `external_ref` (last valid line wins). Corrupted
 * lines are skipped, fail-open, mirroring `lib/bugfix-loop-attempts.mjs`.
 * @param {string} projectRoot
 * @returns {Map<string, object>}
 */
function readAllRaw(projectRoot) {
  const logPath = resolveLinksLogPath(projectRoot);
  if (!existsSync(logPath)) return new Map();
  const raw = readFileSync(logPath, 'utf8');
  const byRef = new Map();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[tracker-sync-links] skipping corrupted line in ${logPath}`);
      continue;
    }
    if (!parsed || typeof parsed.external_ref !== 'string') continue;
    byRef.set(parsed.external_ref, parsed);
  }
  return byRef;
}

function appendRaw(projectRoot, record) {
  const logPath = resolveLinksLogPath(projectRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(record) + '\n', { flag: 'a' });
}

/**
 * @param {string} projectRoot
 * @param {string} externalRef
 * @returns {object|null}
 */
export function findByExternalRef(projectRoot, externalRef) {
  return readAllRaw(projectRoot).get(externalRef) ?? null;
}

/**
 * @param {string} projectRoot
 * @param {string} localIssueId
 * @returns {object|null}
 */
export function findByLocalIssueId(projectRoot, localIssueId) {
  for (const link of readAllRaw(projectRoot).values()) {
    if (link.local_issue_id === localIssueId) return link;
  }
  return null;
}

/**
 * Create a `TrackerSyncLink`. Idempotent — if a link already exists for
 * `externalRef`, the existing link is returned unchanged rather than
 * duplicated (Error Propagation: "two sync runs race on creating a
 * TrackerSyncLink for the same GitHub issue number").
 *
 * @param {string} projectRoot
 * @param {{ externalRef: string, localIssueId: string }} params
 * @returns {object} the created (or pre-existing) link
 */
export function createLink(projectRoot, { externalRef, localIssueId }) {
  const existing = findByExternalRef(projectRoot, externalRef);
  if (existing) return existing;
  const record = {
    external_ref: externalRef,
    local_issue_id: localIssueId,
    accepted_at: new Date().toISOString(),
    last_synced_at: null,
    last_comment_id: null,
  };
  appendRaw(projectRoot, record);
  return record;
}

/**
 * Update a link's `last_synced_at`/`last_comment_id` after a successful
 * outbound comment post (Interaction Contract outbound step 3). Appends a
 * new line to the JSONL log — fold-on-read means the last line wins,
 * mirroring `lib/bugfix-loop-attempts.mjs`.
 *
 * @param {string} projectRoot
 * @param {{ externalRef: string, lastSyncedAt: string, lastCommentId: string|null }} params
 * @returns {object|null} the updated link, or null if no link exists for `externalRef`
 */
export function updateLinkSyncState(projectRoot, { externalRef, lastSyncedAt, lastCommentId }) {
  const existing = findByExternalRef(projectRoot, externalRef);
  if (!existing) return null;
  const updated = { ...existing, last_synced_at: lastSyncedAt, last_comment_id: lastCommentId ?? null };
  appendRaw(projectRoot, updated);
  return updated;
}
