/**
 * Fixture module for tests/evals/convergence — a tiny, real, self-contained
 * rate limiter. Deliberately exports only two functions. A third function
 * referenced by the fixture spec (`resetRateLimitWindow`) does NOT exist here
 * — that gap is the planted mechanism-existence defect the eval measures.
 *
 * Do not "complete" this module to make the spec correct. Its incompleteness
 * is load-bearing for tests/evals/convergence/run-convergence-eval.mjs.
 */

const WINDOW_MS = 60_000;
const LIMIT = 10;

const windows = new Map();

export function checkRateLimit(key) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return { allowed: true };
  }
  entry.count += 1;
  return { allowed: entry.count <= LIMIT };
}

export function getRemainingQuota(key) {
  const entry = windows.get(key);
  if (!entry) return LIMIT;
  return Math.max(0, LIMIT - entry.count);
}
