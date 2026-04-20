// Per-token USD rates derived from per-million prices.
// To convert: divide per-million rate by 1,000,000.
export const PRICE_TABLE = {
  'claude-opus-4-6': {
    input: 15 / 1_000_000,
    output: 75 / 1_000_000,
    cacheRead: 1.50 / 1_000_000,
    cacheCreation: 18.75 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    input: 3 / 1_000_000,
    output: 15 / 1_000_000,
    cacheRead: 0.30 / 1_000_000,
    cacheCreation: 3.75 / 1_000_000,
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80 / 1_000_000,
    output: 4 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
    cacheCreation: 1 / 1_000_000,
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
