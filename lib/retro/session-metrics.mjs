// lib/retro/session-metrics.mjs
//
// Rollup module exposing session-metric sub-helpers as named exports.
// Each export corresponds to a plan task (Tasks 7–11). Per SA-2 the rollup
// is a single file (not a directory).
//
// Source spec: .context-index/specs/features/session-awareness/retro-session-consumption.spec.md

import { validateIssueId } from './issue-id-validation.mjs';
import { scanWithinToolOutputFrame } from './body-scan.mjs';

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

// Per-spec scanner: anchored literal prefix + bounded negated character
// class. SEC-B1 forbids `.+` / `.*` over body content; this pattern uses
// neither — `[^\s)`'"]{1,512}` is a negated character class with an
// explicit upper bound, which is linear-time (no backtracking over body
// content). Each character either matches or fails the class.
const SPEC_PATH_RE = /\.context-index\/specs\/[^\s)`'"]{1,512}\.spec\.md/g;

/**
 * Per-spec session counter sub-helper (Behavior 8).
 *
 * For each session, collect spec references from two sources:
 *   (a) frontmatter `spec:` field, when present.
 *   (b) body literal pattern `.context-index/specs/.../*.spec.md`.
 *
 * Dedupe per `(session, spec)` pair — a body mentioning the same spec
 * twice counts once for that session. A spec appearing in both frontmatter
 * AND body of the same session still counts once. Two distinct sessions
 * touching the same spec each contribute one to that spec's count.
 *
 * Sort: descending by count, ties broken by spec slug ascending. Specs
 * with zero count are omitted.
 *
 * @param {Array<{ format: string, frontmatter: object, body: string }>} sessions
 * @returns {Array<{ spec: string, count: number }>}
 */
export function countPerSpec(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const session of sessions) {
    if (!session) continue;
    const specs = new Set();
    // (a) frontmatter spec field
    const fmSpec = session.frontmatter?.spec;
    if (typeof fmSpec === 'string' && fmSpec.length > 0) {
      specs.add(fmSpec);
    }
    // (b) body literal scan — bounded regex (no `.+`/`.*` backtracking;
    // negated char class is linear).
    if (typeof session.body === 'string' && session.body.length > 0) {
      const matches = session.body.match(SPEC_PATH_RE);
      if (matches) {
        for (const m of matches) specs.add(m);
      }
    }
    // Dedupe per (session, spec) — Set above guarantees uniqueness within
    // this session. Add 1 to each spec's global count.
    for (const spec of specs) {
      counts.set(spec, (counts.get(spec) || 0) + 1);
    }
  }

  const rows = Array.from(counts, ([spec, count]) => ({ spec, count }));
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0;
  });
  return rows;
}

const COST_FIELDS = ['cost_usd', 'input_tokens', 'output_tokens'];

/**
 * Parse a frontmatter cost value to a finite number, or return null with
 * a parse-error sample. YAML may emit numbers as strings; we accept any
 * string that `Number()` resolves to a finite value.
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: number } | { ok: false, value: unknown }}
 */
function parseCostValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return { ok: true, value: n };
  }
  return { ok: false, value };
}

function ensureBucket(map, key) {
  if (!map[key]) map[key] = { cost_usd: 0, input_tokens: 0, output_tokens: 0 };
  return map[key];
}

/**
 * Cost & token aggregator (Behaviors 9, 10; XS-2 narrowing).
 *
 * Aggregates cost_usd, input_tokens, output_tokens across sessions with
 * `kind: session-end`. Sessions with `kind: pre-compact` or `placeholder`
 * are EXCLUDED. Returns null when no session-end session in the window has
 * any cost field at all (so the orchestrator can omit the subsection).
 *
 * Sessions missing a particular field are excluded from that field's
 * aggregate but still counted in the session total.
 *
 * Non-numeric values that cannot be coerced via `Number()` are recorded as
 * `parseErrors[]` samples (diagnostic) and excluded from aggregation.
 *
 * @param {Array<{ format: string, frontmatter: object, body: string }>} sessions
 * @returns {null|{
 *   totals: { cost_usd: number, input_tokens: number, output_tokens: number },
 *   perModel: Record<string, { cost_usd: number, input_tokens: number, output_tokens: number }>,
 *   perSpec: Record<string, { cost_usd: number, input_tokens: number, output_tokens: number }>,
 *   parseErrors: Array<{ field: string, value: unknown, sessionId: string|null }>,
 * }}
 */
export function aggregateCostTokens(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const totals = { cost_usd: 0, input_tokens: 0, output_tokens: 0 };
  const perModel = {};
  const perSpec = {};
  const parseErrors = [];
  let anyFieldSeen = false;

  for (const session of sessions) {
    if (!session) continue;
    const fm = session.frontmatter || {};
    // XS-2: only session-end contributes.
    if (fm.kind !== 'session-end') continue;

    const model = typeof fm.model === 'string' && fm.model.length > 0 ? fm.model : null;
    const spec = typeof fm.spec === 'string' && fm.spec.length > 0 ? fm.spec : null;

    for (const field of COST_FIELDS) {
      if (!(field in fm)) continue;
      anyFieldSeen = true;
      const parsed = parseCostValue(fm[field]);
      if (!parsed.ok) {
        parseErrors.push({
          field,
          value: parsed.value,
          sessionId: typeof fm.session_id === 'string' ? fm.session_id : null,
        });
        continue;
      }
      totals[field] += parsed.value;
      if (model) ensureBucket(perModel, model)[field] += parsed.value;
      if (spec) ensureBucket(perSpec, spec)[field] += parsed.value;
    }

    // Track that `model` was seen — this gives us session-counting at the
    // model granularity even when cost is absent. (Per spec, per-model
    // breakdown only includes those WITH `model`.)
    if (model && !perModel[model]) ensureBucket(perModel, model);
  }

  if (!anyFieldSeen) return null;

  return { totals, perModel, perSpec, parseErrors };
}

/**
 * Sessions ↔ closed-issues xref sub-helper (Task 10 — Behavior 11).
 * Returns null when no session-end sessions have `issue`/`epic` frontmatter.
 *
 * @param {Array<{ frontmatter: object, body: string }>} _sessions
 * @param {object} [_opts] - { issueManager, since, until }
 * @returns {Promise<null|Array<object>>}
 */
/**
 * Sessions ↔ Closed Issues cross-reference (Behavior 11, CON-X3, CON-X5,
 * SEC-B2). Joins `kind: session-end` sessions' `issue:` / `epic:`
 * frontmatter against closed issues in the analysis window.
 *
 * Validates every id via `validateIssueId()` BEFORE any board lookup.
 * Charset-mismatch → row with `annotation: '(invalid)'`. Unrecognized but
 * charset-clean id → still no board lookup, annotation `(invalid)`.
 *
 * @param {Array<{ format: string, frontmatter: object, body: string }>} sessions
 * @param {{ issueManager: object|null, since: string, until: string }} opts
 * @returns {Promise<null|Array<{
 *   id: string,
 *   title: string,
 *   closedAt: string|null,
 *   sessionIds: string[],
 *   annotation: '(invalid)'|'(unknown)'|null,
 * }>>}
 */
export async function joinClosedIssueXref(sessions, opts = {}) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  const issueManager = opts.issueManager || null;

  // Collect candidate (id, session_id, kind-of-ref) tuples from session-end
  // sessions only (XS-2). `issue:` takes precedence over `epic:` when both
  // are present.
  const candidates = [];
  for (const session of sessions) {
    if (!session) continue;
    const fm = session.frontmatter || {};
    if (fm.kind !== 'session-end') continue;

    const refId = typeof fm.issue === 'string' ? fm.issue : (typeof fm.epic === 'string' ? fm.epic : null);
    if (refId === null) continue;

    candidates.push({
      refId,
      sessionId: typeof fm.session_id === 'string' ? fm.session_id : '',
    });
  }

  if (candidates.length === 0) return null;

  // Without a manager we can still report (invalid) rows (since they need
  // no lookup), but pure (unknown) and valid rows require list/get. Return
  // null when manager is absent — graceful degradation.
  if (!issueManager) return null;

  // SEC-B2: validate every candidate BEFORE any board lookup. Group valid
  // candidates by id; surface invalid candidates as `(invalid)` rows.
  /** @type {Map<string, string[]>} */ // id -> [session_id_short...]
  const validById = new Map();
  /** @type {Array<{ id: string, sessionIdShort: string }>} */
  const invalidRows = [];
  for (const c of candidates) {
    const validation = validateIssueId(c.refId);
    const short = c.sessionId.slice(0, 8); // CON-X3
    if (!validation.ok) {
      invalidRows.push({ id: c.refId, sessionIdShort: short });
      continue;
    }
    const arr = validById.get(validation.normalized) || [];
    arr.push(short);
    validById.set(validation.normalized, arr);
  }

  // Closed issues in window from the manager.
  let closed = [];
  try {
    const listed = await issueManager.list({
      status: 'closed',
      since: opts.since,
      until: opts.until,
    });
    if (Array.isArray(listed)) closed = listed;
  } catch {
    closed = [];
  }
  /** @type {Map<string, object>} */
  const closedById = new Map();
  for (const issue of closed) {
    if (issue && typeof issue.id === 'string') closedById.set(issue.id, issue);
  }

  const rows = [];

  for (const [id, sessionIds] of validById) {
    if (closedById.has(id)) {
      const issue = closedById.get(id);
      rows.push({
        id,
        title: typeof issue.title === 'string' ? issue.title : '',
        closedAt: typeof issue.closed_at === 'string' ? issue.closed_at : null,
        sessionIds,
        annotation: null,
      });
      continue;
    }
    // Not in closed-in-window. Try `get(id)` to distinguish (unknown) from
    // "open but exists". CON-X5: not present on the board → (unknown).
    let exists = null;
    try {
      exists = await issueManager.get(id);
    } catch {
      exists = null;
    }
    if (!exists) {
      rows.push({
        id,
        title: '(unknown)',
        closedAt: null,
        sessionIds,
        annotation: '(unknown)',
      });
    }
    // Else: exists but NOT closed in window → exclude from xref entirely.
  }

  // Invalid rows: each candidate gets its own row entry. Group by refId
  // for cleaner output.
  /** @type {Map<string, string[]>} */
  const invalidById = new Map();
  for (const inv of invalidRows) {
    const arr = invalidById.get(inv.id) || [];
    arr.push(inv.sessionIdShort);
    invalidById.set(inv.id, arr);
  }
  for (const [id, sessionIds] of invalidById) {
    rows.push({
      id,
      title: '(invalid)',
      closedAt: null,
      sessionIds,
      annotation: '(invalid)',
    });
  }

  if (rows.length === 0) return null;
  return rows;
}

const GAP_MARKERS = ['no matches', 'file not found', '0 results'];

/**
 * Context Gaps sub-helper (Behavior 12, SEC-B1(3)).
 *
 * Scans HOOK-MODE session bodies for the three documented gap markers,
 * but ONLY matches inside a tool-output frame delimited by ```output …
 * ```. Out-of-frame matches are NOT counted — defense against adversarial
 * prose injection per SEC-B1(b).
 *
 * Aggregates by the spec the session was touching:
 *   - frontmatter `spec:` field (when present), OR
 *   - first body reference to `.context-index/specs/.../*.spec.md`
 *
 * Sessions with no resolvable spec contribute their gaps to a synthetic
 * `(no-spec)` bucket so they remain visible.
 *
 * Returns the top 10 (spec, gap) pairs sorted descending by count.
 *
 * @param {Array<{ format: string, frontmatter: object, body: string }>} sessions
 * @returns {Array<{ spec: string, gap: string, count: number }>}
 */
export function scanContextGaps(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  /** @type {Map<string, number>} */ // key = "spec gap"
  const counts = new Map();

  for (const session of sessions) {
    if (!session || session.format !== 'hook') continue;
    const body = typeof session.body === 'string' ? session.body : '';
    if (body.length === 0) continue;

    // Resolve the spec attribution for this session.
    const fm = session.frontmatter || {};
    let spec = typeof fm.spec === 'string' && fm.spec.length > 0 ? fm.spec : null;
    if (spec === null) {
      const m = body.match(SPEC_PATH_RE);
      if (m && m.length > 0) spec = m[0];
    }
    if (spec === null) spec = '(no-spec)';

    // Frame-anchored scan for each gap marker.
    for (const marker of GAP_MARKERS) {
      const hits = scanWithinToolOutputFrame(body, marker);
      if (hits.length === 0) continue;
      const key = `${spec} ${marker}`;
      counts.set(key, (counts.get(key) || 0) + hits.length);
    }
  }

  const rows = Array.from(counts, ([key, count]) => {
    const sep = key.indexOf(' ');
    return { spec: key.slice(0, sep), gap: key.slice(sep + 1), count };
  });
  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.spec !== b.spec) return a.spec < b.spec ? -1 : 1;
    return a.gap < b.gap ? -1 : a.gap > b.gap ? 1 : 0;
  });
  return rows.slice(0, 10);
}
