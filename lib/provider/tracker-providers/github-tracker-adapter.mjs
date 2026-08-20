/**
 * GitHub `TrackerProviderAdapter` implementation.
 *
 * Shells out to the existing `gh` CLI via argv-array invocation (never a
 * shell-interpolated string), following `lib/cli/coordination.mjs`'s
 * `scanPullRequests` degrade-gracefully precedent (constitution principle 1
 * — `gh` is an already-relied-upon external CLI, not a new npm dependency).
 *
 * `fetchGated` refuses (never truncates-and-accepts) title/body past a fixed
 * length cap, then wraps the (already length-capped) body in a nonce-scoped
 * fence via `lib/governance/context-pack.mjs`'s `fenceBlock`/
 * `neutralizeFenceTokens` — the same primitive `skills/review-specs/SKILL.md`'s
 * dispatch layer already uses to wrap attacker-controllable content for
 * reviewer prompts. Reused as-is, never reimplemented (charter Dependencies).
 *
 * Spec: .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
 * Plan-task: 3
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/provider/tracker-providers/github-tracker-adapter
 */

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fenceBlock } from '../../governance/context-pack.mjs';

/** Refusal cap for `fetchGated`'s title field, per Acceptance Criteria bullet 2. */
export const TITLE_CAP = 200;
/** Refusal cap for `fetchGated`'s body field, per Acceptance Criteria bullet 2. */
export const BODY_CAP = 4000;

const GH_TIMEOUT_MS = 15000;

/**
 * Default `exec` — real `gh` invocation via `execFileSync` (argv array,
 * never shell-interpolated). Injectable for testability, mirroring
 * `scanPullRequests`'s shape.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @returns {{ status: number, stdout: string, error: Error|null }}
 */
function defaultExec(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', timeout: GH_TIMEOUT_MS, ...opts });
    return { status: 0, stdout, error: null };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? '', error: err };
  }
}

/**
 * Build a GitHub `TrackerProviderAdapter`.
 *
 * @param {object} [options]
 * @param {function} [options.exec] - injectable exec, defaults to real `gh` via `execFileSync`
 * @param {string[]} [options.labelPair] - the two labels `gateCheck` filters on, default `['bug', 'help wanted']`
 * @returns {import('../tracker-provider-interface.mjs').TrackerProviderAdapter}
 */
export function createGitHubTrackerAdapter({ exec = defaultExec, labelPair = ['bug', 'help wanted'] } = {}) {
  return {
    /**
     * Query open GitHub issues carrying both labels in `labelPair`.
     * Degrades to `{ available: false, items: [] }` on any failure
     * (`gh` not installed, unauthenticated, rate-limited, offline) —
     * never throws (Error Propagation: "GitHub API unreachable or
     * rate-limited during inbound sync").
     *
     * @returns {Promise<{ available: boolean, items: object[] }>}
     */
    async gateCheck() {
      const res = exec(
        'gh',
        ['issue', 'list', '--label', labelPair[0], '--label', labelPair[1], '--state', 'open', '--json', 'number,title,body,labels'],
        {},
      );
      if (res.error || res.status !== 0) return { available: false, items: [] };
      try {
        return { available: true, items: JSON.parse(res.stdout) };
      } catch {
        return { available: false, items: [] };
      }
    },

    /**
     * Map one gated GitHub issue onto WorkItem-shaped fields. Refuses
     * (does not truncate-and-accept) a title/body past its length cap.
     * The body, once accepted, is wrapped in a nonce-scoped fence via
     * `fenceBlock` before being returned as `notes`.
     *
     * @param {{ number: number|string, title: string, body: string, labels?: string[] }} issue
     * @returns {Promise<object>} `{ refused: true, reason }` or `{ refused: false, collided, title, notes, type: 'bug', affected_modules: [] }`
     */
    async fetchGated(issue) {
      const title = String(issue?.title ?? '');
      const body = String(issue?.body ?? '');
      if (title.length > TITLE_CAP) {
        return { refused: true, reason: `title exceeds ${TITLE_CAP} chars` };
      }
      if (body.length > BODY_CAP) {
        return { refused: true, reason: `body exceeds ${BODY_CAP} chars` };
      }

      const nonce = randomBytes(12).toString('base64url');
      const { text, collided } = fenceBlock({
        nonce,
        attrs: `role="untrusted-github-issue" provider="github" ref="${issue.number}"`,
        body,
      });

      if (collided) {
        // Round-5 review BD-1: surface the collision as a logged warning
        // naming the GitHub issue number — the sync still proceeds with the
        // neutralized text, exactly as dispatch-shape.mjs's
        // CONTEXT_PACK_FENCE_COLLISION warning does for spec content.
        // eslint-disable-next-line no-console
        console.warn(`[github-tracker-adapter] fence-token collision in GitHub issue #${issue.number}'s body — neutralized.`);
      }

      return {
        refused: false,
        collided,
        title,
        notes: text,
        type: 'bug',
        affected_modules: [],
      };
    },

    /**
     * Post a fixed-template comment on a GitHub issue via
     * `gh issue comment <number> --body-file -` (argv array + piped
     * input — never a shell-interpolated string). Never touches issue
     * state, labels, or assignees — comment-only by this method's own
     * narrow signature.
     *
     * @param {string|number} issueRef
     * @param {string} text
     * @returns {Promise<{ posted: boolean }>}
     */
    async postComment(issueRef, text) {
      const res = exec('gh', ['issue', 'comment', String(issueRef), '--body-file', '-'], { input: text });
      if (res.error || res.status !== 0) return { posted: false };
      return { posted: true };
    },
  };
}
