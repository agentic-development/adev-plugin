/**
 * `TrackerProviderAdapter` interface.
 *
 * Deliberately narrow contract each tracker provider implements —
 * `gateCheck()` (no-arg, returns the current batch of gated issues),
 * `fetchGated(issue)` (per-issue field mapper onto WorkItem-shaped fields),
 * and `postComment(issueRef, text)` (comment-shaped, never an open-ended
 * writeback function). This is what enforces "never changes issue
 * state/labels/assignees" as an interface constraint, not only prose.
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 1
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/provider/tracker-provider-interface
 */

import { codedError as mkErr } from '../errors.mjs';

/**
 * @typedef {Object} TrackerProviderAdapter
 * @property {function(): Promise<object>} gateCheck - no-arg; returns the current batch of gated issues
 * @property {function(object): Promise<object>} fetchGated - per-issue field mapper; returns WorkItem-shaped fields
 * @property {function(string, string): Promise<object>} postComment - (issueRef, text) => result; comment-only, never touches issue state/labels/assignees
 */

/** The three methods every `TrackerProviderAdapter` must implement. */
export const TRACKER_PROVIDER_METHODS = ['gateCheck', 'fetchGated', 'postComment'];

/**
 * Runtime shape guard for a `TrackerProviderAdapter`. Throws
 * `INVALID_TRACKER_PROVIDER_SHAPE` naming which methods are missing.
 *
 * @param {object} adapter
 * @param {string} name - provider name, for the error message
 */
export function assertTrackerProviderShape(adapter, name) {
  const missing = TRACKER_PROVIDER_METHODS.filter((m) => typeof adapter?.[m] !== 'function');
  if (missing.length > 0) {
    throw mkErr(
      'INVALID_TRACKER_PROVIDER_SHAPE',
      `INVALID_TRACKER_PROVIDER_SHAPE: provider "${name}" is missing: ${missing.join(', ')}`,
    );
  }
}
