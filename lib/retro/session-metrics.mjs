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
