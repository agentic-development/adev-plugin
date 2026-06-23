// lib/cost-formatters.mjs
//
// Text and JSON formatters for the cost-summary aggregator
// (.context-index/specs/features/session-awareness/cost-ticker.spec.md).
//
// `formatText(agg, { includeCheckpoints })` produces the compact one-line
// Behavior-2 summary, optionally followed by a per-step table when
// `includeCheckpoints` is true (Behavior 4).
//
// `formatJson(agg)` produces the Behavior-3 schema as a single-line JSON
// string. The aggregator already enforces 6-decimal precision on
// `cost_usd` and 3-decimal precision on `share`, so the formatter does
// not re-round.

/**
 * Compact-token formatter.
 *   < 1 K   → integer (e.g. "512")
 *   < 1 M   → "<N.N>K"  (one decimal, trailing-zero stripped: "38K", "1.5K")
 *   ≥ 1 M   → "<N.N>M"
 *
 * @param {number} n
 * @returns {string}
 */
function compactTok(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000) {
    const k = v / 1000;
    // One decimal when not a whole multiple of K, integer otherwise.
    return k >= 100 || k === Math.round(k) ? `${Math.round(k)}K` : `${k.toFixed(1)}K`;
  }
  const m = v / 1_000_000;
  return m >= 100 || m === Math.round(m) ? `${Math.round(m)}M` : `${m.toFixed(1)}M`;
}

/**
 * Cache-read share as a rounded integer percent of (cache_read_tokens
 * + input_tokens + output_tokens + cache_creation_tokens). Returns 0
 * when total is 0.
 *
 * @param {object} totals
 * @returns {number}
 */
function cachePct(totals) {
  const total =
    (Number(totals.input_tokens) || 0) +
    (Number(totals.output_tokens) || 0) +
    (Number(totals.cache_read_tokens) || 0) +
    (Number(totals.cache_creation_tokens) || 0);
  if (total === 0) return 0;
  return Math.round((100 * (Number(totals.cache_read_tokens) || 0)) / total);
}

/**
 * Short model summary: takes the dominant model (first entry in the
 * pre-sorted model_breakdown), strips the `claude-` prefix and any
 * date/version suffix, returns the family slug (e.g. `sonnet`). When
 * more than one model contributed, appends `+<N-1>`.
 *
 * @param {object[]} modelBreakdown
 * @returns {string}
 */
function dominantModelSummary(modelBreakdown) {
  if (!Array.isArray(modelBreakdown) || modelBreakdown.length === 0) return "unknown";
  const dominant = modelBreakdown[0]?.model ?? "unknown";
  // Reduce "claude-sonnet-4-6" → "sonnet". Strip "claude-" prefix; pick
  // the first segment after that (the family).
  let label = dominant;
  if (label.startsWith("claude-")) label = label.slice("claude-".length);
  // Split on '-' and take the first non-numeric segment.
  const parts = label.split("-");
  const family = parts.find((p) => /[a-z]/i.test(p) && !/^\d/.test(p)) ?? label;
  if (modelBreakdown.length > 1) return `${family}+${modelBreakdown.length - 1}`;
  return family;
}

/**
 * Format an aggregate as the one-line text summary defined in Behavior
 * 2. When `agg.totals === null`, returns the "no usage data yet"
 * sentinel. When `includeCheckpoints` is true, appends a per-step table
 * (Behavior 4) below the summary line.
 *
 * @param {object} agg
 * @param {{ includeCheckpoints?: boolean }} [opts]
 * @returns {string}
 */
export function formatText(agg, { includeCheckpoints = false } = {}) {
  if (agg?.totals == null) {
    return "cost: (no usage data yet)";
  }
  const t = agg.totals;
  const totalTok =
    (Number(t.input_tokens) || 0) +
    (Number(t.output_tokens) || 0) +
    (Number(t.cache_read_tokens) || 0) +
    (Number(t.cache_creation_tokens) || 0);

  const cost = (Number(t.cost_usd) || 0).toFixed(2);
  const pct = cachePct(t);
  const wall = Math.round(Number(t.wall_seconds) || 0);
  const model = dominantModelSummary(agg.model_breakdown || []);

  const line =
    `cost: $${cost} · ${compactTok(totalTok)} tok ` +
    `(${compactTok(t.cache_read_tokens)} cache·read ${pct}% · ` +
    `${compactTok(t.output_tokens)} out · ${compactTok(t.input_tokens)} in) · ` +
    `${wall}s · ${model}`;

  if (!includeCheckpoints) return line;

  // Append per-step table (Behavior 4).
  const checkpoints = Array.isArray(agg.checkpoints) ? agg.checkpoints : [];
  const rows = [
    ...checkpoints.map((c) => [
      c.step,
      `$${(Number(c.cost_usd) || 0).toFixed(2)}`,
      compactTok(
        (Number(c.input_tokens) || 0) +
          (Number(c.output_tokens) || 0) +
          (Number(c.cache_read_tokens) || 0) +
          (Number(c.cache_creation_tokens) || 0),
      ),
      `${Math.round(Number(c.wall_seconds) || 0)}s`,
    ]),
    ["total", `$${cost}`, compactTok(totalTok), `${wall}s`],
  ];
  // Fixed-width columns: compute max width per column.
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  const formatted = rows
    .map((r) => r.map((v, col) => v.padEnd(widths[col])).join("  "))
    .join("\n");

  return `${line}\n${formatted}`;
}

/**
 * Format an aggregate as the Behavior-3 JSON schema. Always emits
 * `checkpoints` and `model_breakdown` as arrays (possibly empty).
 * Field precision is preserved from the aggregator (cost_usd: 6 decimals,
 * share: 3 decimals).
 *
 * @param {object} agg
 * @returns {string}
 */
export function formatJson(agg) {
  const shape = {
    spec: agg?.spec ?? null,
    issue_id: agg?.issue_id ?? null,
    totals: agg?.totals ?? null,
    checkpoints: Array.isArray(agg?.checkpoints) ? agg.checkpoints : [],
    model_breakdown: Array.isArray(agg?.model_breakdown) ? agg.model_breakdown : [],
    skipped_lines: Number(agg?.skipped_lines) || 0,
  };
  return JSON.stringify(shape);
}

export default { formatText, formatJson };
