/**
 * Inbound sync orchestration — Interaction Contract inbound steps 1-5.
 *
 * Triggered by `/adev:bugfix-loop --github-sync` at the start of each turn.
 * Resolves the active `TrackerProviderAdapter` via `TrackerProviderRegistry`,
 * calls `gateCheck()`, and for each gated issue either creates a new
 * `TrackerSyncLink` + local `WorkItem` (capped/fenced via the adapter's
 * `fetchGated`) or, for an already-linked issue, evaluates the fires-once-
 * per-run stale-link notice.
 *
 * All escalation state (`unreachable_consecutive_turns`,
 * `oversized_consecutive_turns`, `degraded_sync_note`,
 * `stale_link_notices_surfaced`) is read from and written to the SAME
 * `BugfixLoopRun` run-state file the skill already persists every turn —
 * never an in-process/adapter-local variable, which cannot survive the
 * skill's fresh-context-per-turn self-re-invocation.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 7
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/tracker-provider-bridge/inbound-sync
 */

import { get as getTrackerProvider } from '../provider/tracker-provider-registry.mjs';
import { createLink, findByExternalRef } from '../tracker-sync-links.mjs';
import {
  recordSyncRetry, resetSyncRetry, recordStaleLinkNotice, hasStaleLinkNoticeFired, readRunState,
} from '../bugfix-loop-run.mjs';
import { getIssueManager } from '../issues/registry.mjs';
import { readAttemptRecord } from '../bugfix-loop-attempts.mjs';

/** Default `tasks.bugfix_loop.tracker_link_stale_days` (Interaction Contract inbound step 5). */
const DEFAULT_STALE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/**
 * Run one turn of inbound sync.
 *
 * @param {object} params
 * @param {string} params.projectRoot
 * @param {object} params.manifest
 * @param {string} params.runId
 * @returns {Promise<{ degraded: boolean, linked: number, reason?: string, notices?: string[] }>}
 */
export async function runInboundSync({ projectRoot, manifest, runId }) {
  const providerName = manifest?.tasks?.bugfix_loop?.tracker_provider ?? 'github';
  const staleDays = manifest?.tasks?.bugfix_loop?.tracker_link_stale_days ?? DEFAULT_STALE_DAYS;

  const preState = readRunState(projectRoot, runId);
  if (preState.degraded_sync_note) {
    // Error Propagation (GitHub-unreachable row): once degraded_sync_note is
    // set, gateCheck() is not called at all for the remainder of this run.
    return { degraded: true, linked: 0, reason: 'already_degraded' };
  }

  let provider;
  try {
    provider = getTrackerProvider(providerName);
  } catch (err) {
    if (err.code === 'UNKNOWN_TRACKER_PROVIDER') {
      // Error Propagation row 2 (revision 7, WR-1): treated identically to
      // GitHub-unreachable — same counter, same escalation.
      recordSyncRetry(projectRoot, runId, { kind: 'unreachable' });
      return { degraded: true, linked: 0, reason: 'unknown_provider' };
    }
    throw err;
  }

  const gate = await provider.gateCheck();
  if (!gate.available) {
    recordSyncRetry(projectRoot, runId, { kind: 'unreachable' });
    return { degraded: true, linked: 0, reason: 'gh_unreachable' };
  }
  resetSyncRetry(projectRoot, runId, { kind: 'unreachable' });

  const issueManager = getIssueManager(manifest, projectRoot);

  // Read the oversized-per-issue-number map ONCE, before invoking fetchGated
  // on any candidate this turn (Error Propagation, oversized row): an issue
  // number whose counter already reads >= 5 is excluded outright.
  const turnStartState = readRunState(projectRoot, runId);
  const oversizedCounts = turnStartState.sync_retry_counts.oversized_consecutive_turns;

  let linked = 0;
  const notices = [];

  for (const issue of gate.items) {
    const externalRef = `github:${issue.number}`;
    const existingLink = findByExternalRef(projectRoot, externalRef);

    if (!existingLink) {
      const oversizedStreak = oversizedCounts[issue.number] ?? 0;
      if (oversizedStreak >= 5) {
        continue; // excluded for the remainder of this run
      }

      const fetched = await provider.fetchGated(issue);
      if (fetched.refused) {
        recordSyncRetry(projectRoot, runId, { kind: 'oversized', issueNumber: issue.number });
        continue;
      }
      // No longer oversized (or wasn't) — clear any prior streak so a
      // maintainer's edit makes the issue eligible again immediately.
      if (oversizedStreak > 0) {
        resetSyncRetry(projectRoot, runId, { kind: 'oversized', issueNumber: issue.number });
      }

      // `validateIssue` (used by `create()`) returns a FIXED WHITELIST that
      // does NOT include `affected_modules` (lib/issues/interface.mjs's own
      // documented silent-drop hazard) — `create({ affected_modules: [] })`
      // would appear to succeed and persist nothing. `update()` has no such
      // whitelist, so setting it as a follow-up call (mirroring
      // `adev issues set-modules`'s precedent) is what actually persists it.
      const created = await issueManager.create({
        title: fetched.title,
        type: 'bug',
        notes: fetched.notes,
      });
      await issueManager.update(created.id, { affected_modules: [] });
      createLink(projectRoot, { externalRef, localIssueId: created.id });
      linked += 1;
    } else {
      // Interaction Contract inbound step 5 (revision 7, WR-2 / revision 8, TR-4):
      // accepted_at is this step's reader — a stale, never-attempted link
      // logs a notice at most once per external ref per run.
      const ageDays = (Date.now() - new Date(existingLink.accepted_at).getTime()) / MS_PER_DAY;
      if (ageDays >= staleDays && !hasStaleLinkNoticeFired(projectRoot, runId, externalRef)) {
        const attemptRecord = readAttemptRecord(projectRoot, existingLink.local_issue_id);
        if (!attemptRecord) {
          notices.push(`stale tracker link: GitHub issue ${issue.number} linked ${Math.floor(ageDays)}d ago, never attempted`);
          recordStaleLinkNotice(projectRoot, runId, externalRef);
        }
      }
    }
  }

  return { degraded: false, linked, notices };
}
