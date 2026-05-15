/**
 * Single source of truth for legal spec frontmatter `status` values.
 *
 * Every adev writer that sets or reads `status:` on a spec.md frontmatter
 * MUST consume `SPEC_STATUSES` from this module instead of inlining string
 * literals. The diagnostic `adev/status-enum-legal` reads this enum at
 * runtime; if a writer drifts (e.g. invents a new status), the diagnostic
 * fires at write time (per `diagnostic-registry.spec.md` rev 2 amendment 3).
 *
 * Order matches the canonical lifecycle progression so callers can use
 * `SPEC_STATUSES[i]` indexing if they prefer that to named imports.
 *
 *   draft → review-pending → review-passed | review-blocked
 *         → implemented → validated
 *         → superseded (terminal alt for any prior state)
 *
 * Zero external dependencies. Pure data + a single thin guard.
 *
 * @module lib/spec-status
 */

/**
 * Frozen array of the seven legal spec frontmatter `status:` values.
 *
 * Frozen so callers cannot mutate the canonical set out from under other
 * consumers. Treat as `Readonly<string[]>`.
 *
 * @type {readonly ["draft", "review-pending", "review-passed", "review-blocked", "implemented", "validated", "superseded"]}
 */
export const SPEC_STATUSES = Object.freeze([
  'draft',
  'review-pending',
  'review-passed',
  'review-blocked',
  'implemented',
  'validated',
  'superseded',
]);

/**
 * Assert that `value` is one of the seven legal spec frontmatter statuses.
 *
 * Throws an error with `code === 'SPEC_STATUS_INVALID'` (and a descriptive
 * message naming the offending value) on any non-legal input — including
 * `null`, `undefined`, the empty string, non-string types, and strings
 * outside the enum.
 *
 * Returns `undefined` on success (void) so the function reads as an
 * assertion rather than a predicate at call sites.
 *
 * @param {unknown} value - The status value to validate.
 * @returns {void}
 * @throws {Error} `SPEC_STATUS_INVALID` if `value` is not in `SPEC_STATUSES`.
 */
export function assertLegalStatus(value) {
  if (typeof value !== 'string' || !SPEC_STATUSES.includes(value)) {
    // Stringify defensively so the message is readable for non-string inputs
    // (objects render as "[object Object]", null as "null", etc).
    const err = new Error(
      `spec status ${JSON.stringify(value)} is not in SPEC_STATUSES (legal: ${SPEC_STATUSES.join(', ')})`,
    );
    err.code = 'SPEC_STATUS_INVALID';
    throw err;
  }
}
