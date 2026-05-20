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
 * Tool-use distribution sub-helper (Behavior 7, SA-3 path-b).
 *
 * Parses rendered markdown bodies of HOOK-MODE sessions only. Counts tool
 * mentions matching exactly two consumer-pinned patterns (case-sensitive,
 * at line start):
 *
 *   1. `### <Tool>`         — markdown H3 heading
 *   2. `**Tool:** <name>`   — labeled tool line
 *
 * Returns the top 10 tools sorted descending by count, with alphabetical
 * tie-break on the tool name.
 *
 * @param {Array<{ format: string, frontmatter: object, body: string }>} sessions
 * @returns {Array<{ tool: string, count: number }>}
 */
export function parseToolUseDistribution(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const session of sessions) {
    if (!session || session.format !== 'hook') continue;
    if (typeof session.body !== 'string' || session.body.length === 0) continue;
    for (const line of session.body.split('\n')) {
      // Pattern 1: literal `### <Tool>` at line start. The H3 marker is
      // followed by a single space, then the tool name. Reject longer
      // heading markers (#### etc.) by requiring exact prefix.
      if (line.startsWith('### ') && !line.startsWith('#### ')) {
        const rest = line.slice(4).trim();
        if (rest.length > 0) {
          counts.set(rest, (counts.get(rest) || 0) + 1);
        }
        continue;
      }
      // Pattern 2: literal `**Tool:** <name>` at line start.
      if (line.startsWith('**Tool:** ')) {
        const rest = line.slice('**Tool:** '.length).trim();
        if (rest.length > 0) {
          counts.set(rest, (counts.get(rest) || 0) + 1);
        }
      }
    }
  }

  const rows = Array.from(counts, ([tool, count]) => ({ tool, count }));
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tool < b.tool ? -1 : a.tool > b.tool ? 1 : 0;
  });
  return rows.slice(0, 10);
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
