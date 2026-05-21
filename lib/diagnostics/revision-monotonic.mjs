/**
 * `adev/revision-monotonic` diagnostic.
 *
 * Task 8 of review-block-auto-retry.plan.md. Guards `/adev:specify --revise`
 * writes so the spec's `revision:` field strictly increments by exactly 1
 * each call. Rejects non-incrementing writes (no-op `revision:` same as
 * before), decrements, and skips (jump from N → N+2 or higher).
 *
 * Pure function — no I/O. The caller (`lib/specify-revise.mjs`) invokes
 * `checkRevisionMonotonic(prior, candidate)` before committing the
 * atomic-renamed temp file.
 *
 * @module lib/diagnostics/revision-monotonic
 */

function mkErr(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

/**
 * Validate that a candidate revision strictly increments the prior by one.
 *
 * @param {number} prior     - the spec's current `revision:` field (>= 1)
 * @param {number} candidate - the proposed next revision
 * @returns {{prior: number, candidate: number}} on success
 * @throws {Error} `REVISION_NOT_INCREMENTED` on any violation.
 */
export function checkRevisionMonotonic(prior, candidate) {
  if (!Number.isInteger(prior) || prior < 1) {
    throw mkErr(
      'REVISION_NOT_INCREMENTED',
      `prior revision must be an integer >= 1; got ${JSON.stringify(prior)}`,
    );
  }
  if (!Number.isInteger(candidate) || candidate < 1) {
    throw mkErr(
      'REVISION_NOT_INCREMENTED',
      `candidate revision must be an integer >= 1; got ${JSON.stringify(candidate)}`,
    );
  }
  if (candidate <= prior) {
    throw mkErr(
      'REVISION_NOT_INCREMENTED',
      `revision must strictly increment: prior=${prior}, candidate=${candidate}`,
    );
  }
  if (candidate !== prior + 1) {
    throw mkErr(
      'REVISION_NOT_INCREMENTED',
      `revision must increment by exactly 1: prior=${prior}, candidate=${candidate}`,
    );
  }
  return { prior, candidate };
}
