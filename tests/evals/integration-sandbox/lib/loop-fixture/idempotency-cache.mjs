/**
 * Fixture module for tests/evals/convergence — a tiny, real, self-contained
 * idempotency cache. Companion to `clean-loop-fixture.spec.md`: unlike
 * `rate-limiter.mjs` (which deliberately omits a function the fixture spec
 * cites), every function this module exports is real and matches its
 * spec's behaviors exactly. This module's completeness is load-bearing —
 * do not remove or rename anything here, it would break the "this fixture
 * should PASS" control.
 */

const TTL_MS = 300_000;

const seen = new Map();

export function recordRequest(key) {
  if (typeof key !== 'string' || key.length === 0) {
    const err = new Error(`recordRequest: invalid key ${JSON.stringify(key)}`);
    err.code = 'INVALID_IDEMPOTENCY_KEY';
    throw err;
  }
  const now = Date.now();
  const entry = seen.get(key);
  if (entry && now - entry.ts <= TTL_MS) {
    return { duplicate: true };
  }
  seen.set(key, { ts: now });
  return { duplicate: false };
}

export function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of seen) {
    if (now - entry.ts > TTL_MS) {
      seen.delete(key);
    }
  }
}
