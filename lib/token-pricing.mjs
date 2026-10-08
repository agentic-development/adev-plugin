// Per-token USD rates derived from per-million prices.
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// To convert: divide per-million rate by 1,000,000.
//
// Schema mapping vs the published table:
//   input          → "Base Input Tokens"
//   output         → "Output Tokens"
//   cacheRead      → "Cache Hits & Refreshes" (i.e. read on a hit)
//   cacheCreation  → "5m Cache Writes" (the default cache_control TTL).
//                    The 1h variant (2x base input) is not modeled in
//                    the per-token cost path; consumers that opt into
//                    1h caches will under-report by the multiplier.
export const PRICE_TABLE = {
  // Cache-hit multipliers differ by model: 0.1x base input by default, 0.05x
  // on Sonnet 5.5 / Opus 5.5, 0.025x on Fable 5.1 / Mythos 5.1. Read each
  // row's cacheRead from the published table rather than deriving it.
  'claude-fable-5': {
    input: 10 / 1_000_000,
    output: 50 / 1_000_000,
    cacheRead: 1.00 / 1_000_000,
    cacheCreation: 12.50 / 1_000_000,
  },
  'claude-mythos-5': {
    // Project Glasswing only; same pricing/capabilities as claude-fable-5.
    input: 10 / 1_000_000,
    output: 50 / 1_000_000,
    cacheRead: 1.00 / 1_000_000,
    cacheCreation: 12.50 / 1_000_000,
  },
  'claude-opus-5': {
    input: 5 / 1_000_000,
    output: 25 / 1_000_000,
    cacheRead: 0.50 / 1_000_000,
    cacheCreation: 6.25 / 1_000_000,
  },
  'claude-opus-4-8': {
    input: 5 / 1_000_000,
    output: 25 / 1_000_000,
    cacheRead: 0.50 / 1_000_000,
    cacheCreation: 6.25 / 1_000_000,
  },
  'claude-opus-4-7': {
    input: 5 / 1_000_000,
    output: 25 / 1_000_000,
    cacheRead: 0.50 / 1_000_000,
    cacheCreation: 6.25 / 1_000_000,
  },
  'claude-opus-4-6': {
    input: 5 / 1_000_000,
    output: 25 / 1_000_000,
    cacheRead: 0.50 / 1_000_000,
    cacheCreation: 6.25 / 1_000_000,
  },
  'claude-sonnet-5-5': {
    input: 2 / 1_000_000,
    output: 10 / 1_000_000,
    cacheRead: 0.10 / 1_000_000,
    cacheCreation: 2.50 / 1_000_000,
  },
  'claude-sonnet-5': {
    input: 2 / 1_000_000,
    output: 10 / 1_000_000,
    cacheRead: 0.20 / 1_000_000,
    cacheCreation: 2.50 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
    cacheRead: 0.30 / 1_000_000,
    cacheCreation: 3.75 / 1_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input: 1 / 1_000_000,
    output: 5 / 1_000_000,
    cacheRead: 0.10 / 1_000_000,
    cacheCreation: 1.25 / 1_000_000,
  },
};

/**
 * Returns the rate object for a known model ID, or null for unknown models.
 * @param {string} modelId
 * @returns {{ input: number, output: number, cacheRead: number, cacheCreation: number } | null}
 */
export function getRate(modelId) {
  return PRICE_TABLE[modelId] ?? null;
}

/**
 * Computes the USD cost for a given model and token usage.
 * Returns a number rounded to 6 decimal places, or null if the model is unknown.
 * @param {string} modelId
 * @param {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number }} usage
 * @returns {number | null}
 */
export function computeCost(modelId, usage) {
  const rate = getRate(modelId);
  if (rate === null) return null;

  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = usage;
  const cost =
    inputTokens * rate.input +
    outputTokens * rate.output +
    cacheReadTokens * rate.cacheRead +
    cacheCreationTokens * rate.cacheCreation;

  return Math.round(cost * 1e6) / 1e6;
}
