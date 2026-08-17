/**
 * Shared coded-error constructor.
 *
 * Many modules throw `Error` instances tagged with a machine-readable
 * `.code` property (e.g. `'INVALID_PROJECT_ROOT'`) so callers can branch on
 * error type without string-matching `message`. This tiny helper was
 * independently reimplemented across a dozen-plus modules under names like
 * `mkErr`, `coded`, and `makeError` (flagged by /adev:codehealth's
 * duplicate-logic pass); it is consolidated here so the shape has one
 * definition.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1).
 *
 * @module lib/errors
 */

/**
 * Build an `Error` with a `.code` property set.
 *
 * @param {string} code - machine-readable error code (e.g. 'INVALID_PROJECT_ROOT')
 * @param {string} message - human-readable error message
 * @returns {Error} the constructed (not thrown) error, with `.code` set
 */
export function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Throw a coded error. Convenience wrapper around {@link codedError} for the
 * common "validate, then bail with a coded error" shape (several
 * `lib/extensions/*.mjs` modules independently named this `refuse`).
 *
 * @param {string} message - human-readable error message
 * @param {string} code - machine-readable error code
 * @throws {Error} always — with `.code` set to `code`
 */
export function refuse(message, code) {
  throw codedError(code, message);
}
