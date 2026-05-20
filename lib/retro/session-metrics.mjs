// lib/retro/session-metrics.mjs
//
// Rollup module exposing session-metric sub-helpers as named exports.
// Each export is added in its own plan task (Tasks 7–11). Until the
// corresponding task lands, the helper returns a documented empty shape
// — the orchestrator (Task 6) is wired to call into these slots and
// tolerate empty results until the sub-helpers are filled in.
//
// Per SA-2 the rollup is a single file (not a directory).
//
// Source spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md

/**
 * Tool-use distribution sub-helper (Task 7 — Behavior 7).
 * Returns the top-10 tool frequency rows from hook-mode session bodies.
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @returns {Array<{ tool: string, count: number }>}
 */
// eslint-disable-next-line no-unused-vars
export function parseToolUseDistribution(_sessions) {
  return [];
}

/**
 * Per-spec session counter sub-helper (Task 8 — Behavior 8).
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @returns {Array<{ spec: string, count: number }>}
 */
// eslint-disable-next-line no-unused-vars
export function countPerSpec(_sessions) {
  return [];
}

/**
 * Cost/token aggregator sub-helper (Task 9 — Behaviors 9, 10).
 * Returns null when no session-end sessions have any cost frontmatter
 * field (so the orchestrator omits the subsection).
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @returns {null|{ totals: object, perModel: object, perSpec: object, parseErrors: Array<object> }}
 */
// eslint-disable-next-line no-unused-vars
export function aggregateCostTokens(_sessions) {
  return null;
}

/**
 * Sessions ↔ closed-issues xref sub-helper (Task 10 — Behavior 11).
 * Returns null when no session-end sessions have `issue`/`epic` frontmatter.
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @param {object} [_opts] - { issueManager, since, until }
 * @returns {Promise<null|Array<object>>}
 */
// eslint-disable-next-line no-unused-vars
export async function joinClosedIssueXref(_sessions, _opts = {}) {
  return null;
}

/**
 * Context-gaps sub-helper (Task 11 — Behavior 12, SEC-B1(3)).
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @returns {Array<{ spec: string, gap: string, count: number }>}
 */
// eslint-disable-next-line no-unused-vars
export function scanContextGaps(_sessions) {
  return [];
}
