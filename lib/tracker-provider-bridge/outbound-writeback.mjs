/**
 * Outbound writeback orchestration — Interaction Contract outbound steps 1-4.
 *
 * Triggered by `/adev:bugfix-loop --github-sync` after each bug attempt
 * completes (never on claim — no trigger exists for that). Looks up the
 * attempted WorkItem's `TrackerSyncLink`, resolves the active
 * `TrackerProviderAdapter` via `TrackerProviderRegistry` (re-resolved
 * independently from inbound sync — outbound writeback is a separate
 * trigger), and posts a fixed-template outcome comment — skipping a
 * duplicate post when `last_synced_at` already covers this attempt's
 * completion timestamp.
 *
 * Never touches GitHub issue state, labels, or assignees — comment-only,
 * enforced by `postComment`'s narrow interface signature.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 8
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/tracker-provider-bridge/outbound-writeback
 */

import { get as getTrackerProvider } from '../provider/tracker-provider-registry.mjs';
import { findByLocalIssueId, updateLinkSyncState } from '../tracker-sync-links.mjs';

/** Fixed-template outcome comments — never issue-controlled free text. */
const VERDICT_TEMPLATE = {
  FIXED: (id) => `This issue's linked fix attempt (WorkItem ${id}) completed: FIXED. The local board reflects this outcome.`,
  PARKED: (id) => `This issue's linked fix attempt (WorkItem ${id}) completed: PARKED (attempt cap or eligibility limit reached).`,
  UNREPRODUCIBLE: (id) => `This issue's linked fix attempt (WorkItem ${id}) completed: UNREPRODUCIBLE.`,
};

/**
 * Run one outbound writeback for a completed `/adev:debug --auto` attempt.
 *
 * @param {object} params
 * @param {string} params.projectRoot
 * @param {object} params.manifest
 * @param {string} params.localIssueId
 * @param {'FIXED'|'PARKED'|'UNREPRODUCIBLE'} params.verdict
 * @param {string} params.completedAt - ISO 8601 timestamp of the attempt's completion
 * @returns {Promise<{ posted: boolean, reason?: string, commentId?: string|null }>}
 */
export async function runOutboundWriteback({ projectRoot, manifest, localIssueId, verdict, completedAt }) {
  const link = findByLocalIssueId(projectRoot, localIssueId);
  if (!link) return { posted: false, reason: 'no_link' };

  // Interaction Contract outbound step 2 (revision 7, WR-3): read
  // last_synced_at BEFORE posting — if it already covers this attempt's
  // completion timestamp, the outcome comment for this exact attempt has
  // already been posted (e.g. re-invoked after a partial run interruption).
  if (link.last_synced_at && new Date(link.last_synced_at).getTime() >= new Date(completedAt).getTime()) {
    return { posted: false, reason: 'already_posted', commentId: link.last_comment_id };
  }

  const providerName = manifest?.tasks?.bugfix_loop?.tracker_provider ?? 'github';
  let provider;
  try {
    provider = getTrackerProvider(providerName);
  } catch {
    return { posted: false, reason: 'unavailable' };
  }

  const templateFn = VERDICT_TEMPLATE[verdict];
  if (!templateFn) return { posted: false, reason: 'unknown_verdict' };

  const issueNumber = link.external_ref.replace(/^github:/, '');
  const res = await provider.postComment(issueNumber, templateFn(localIssueId));
  if (!res.posted) return { posted: false, reason: 'post_failed' };

  // Interaction Contract outbound step 3: close the write-only gap (WR-3) —
  // every subsequent writeback for this link reads these fields back first.
  updateLinkSyncState(projectRoot, {
    externalRef: link.external_ref,
    lastSyncedAt: completedAt,
    lastCommentId: res.commentId ?? null,
  });

  return { posted: true, commentId: res.commentId ?? null };
}
