/**
 * Render-time defensive stripping for `remedy_ref` (BEH-1, cross-cutting
 * `review-block-auto-retry-rev-2-targeted-author-verify-loop.spec.md`).
 *
 * `lib/blockers-writer.mjs`'s `refuseUnsafeScalar`/`resolveRemedyRef` already
 * gate `remedy_ref` at write time so an unsafe value never lands in the
 * `.blockers.md` sidecar. This helper is the independent, render-time half of
 * that defense: even a value that somehow bypassed the write-time gate (a
 * hand-edited sidecar, a future producer that skips the writer) must not be
 * able to inject terminal escape sequences into the build's progress line or
 * blow up report rendering when the review report echoes it back.
 *
 * Mirrors the established strip pattern in `lib/cli/heuristics.mjs`'s
 * `sanitizeForEcho` (see `.context-index/specs/cross-cutting/check-id-enum.spec.md`
 * SEC-8): drop ANSI CSI escape sequences first, then every C0/C1 control
 * character plus the two Unicode line separators that would still break a
 * one-line render, then length-bound with a truncation marker. Kept as its
 * own module (rather than importing the CLI-internal helper) so governance
 * rendering does not depend on `lib/cli/` internals.
 */

/** CSI-style ANSI escape sequences (colour, cursor moves, erase). */
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_SEQUENCE = /\x1b\[[0-9;?]*[\x20-\x2f]*[\x40-\x7e]/g;

/**
 * C0 and C1 control characters (including a bare ESC and DEL), plus the two
 * Unicode line separators — U+2028/U+2029 sit outside C1 but still break a
 * one-line progress line or report cell into two.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f-\x9f\u2028\u2029]/g;

/** Hard cap on the rendered length of a `remedy_ref` value. */
const MAX_LEN = 256;

/** Marker appended when a value is truncated at {@link MAX_LEN}. */
const TRUNCATION_MARKER = '...';

/**
 * Render a `remedy_ref` value defensively: strip ANSI escape sequences and
 * control characters, then length-bound with a truncation marker.
 *
 * Never throws. A non-string, empty, `null`, or `undefined` input renders as
 * the empty string, matching the "no remedy_ref" render case in both the
 * build progress line and the review report.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function renderRemedyRef(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  const withoutAnsi = value.replace(ANSI_ESCAPE_SEQUENCE, '');
  const withoutControls = withoutAnsi.replace(CONTROL_CHARACTERS, '');
  if (withoutControls.length <= MAX_LEN) return withoutControls;
  return `${withoutControls.slice(0, MAX_LEN)}${TRUNCATION_MARKER}`;
}
