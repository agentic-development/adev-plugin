/**
 * @module lib/evals/score-schema
 *
 * The Layer 3 score result schema, declared as data.
 *
 * This module IS the schema: it is the single place a reviewer reads to
 * learn the result contract — which statuses a half may report in place of a
 * number, which error codes a scoring run may raise, and which verdict kinds
 * a result entry may carry. It holds frozen constants only: no functions, no
 * I/O, no imports. `lib/evals/score.mjs` is the executable expression of
 * these constants; it must never restate the contract, only consume it.
 *
 * It does not re-declare `ELEMENT_VERDICTS` or `CRITERION_VERDICTS`: those
 * already live in `rubric-schema.mjs`, and a second copy would be the exact
 * duplication the charter's Naming attribute prohibits.
 */

/**
 * The statuses a scored half may report instead of a number. A half's value
 * is a number or one of these, never a number standing in for the absence of
 * one: `0` means "scored, and earned nothing".
 *
 * `INSUFFICIENT_EVIDENCE` — the judges answered `unknown` too often (or
 * exclusively) to trust the numeric result.
 * `NOT_SCORED` — no rubric entry applied to this half at all.
 */
export const HALF_STATUSES = Object.freeze(["INSUFFICIENT_EVIDENCE", "NOT_SCORED"]);

/**
 * The two kinds a scored verdict entry may carry, naming the two rubric
 * lists a verdict can originate from and nothing else: `element` for a
 * deterministic `required_elements` entry, `criterion` for a judged
 * `quality_dimensions` entry.
 */
export const VERDICT_KINDS = Object.freeze(["element", "criterion"]);

/**
 * Every error code a scoring run may raise. These match the spec's Error
 * Cases table one-for-one and are ordered as that table orders them.
 */
export const SCORE_ERROR_CODES = Object.freeze([
  "SCORE_EMPTY_EVIDENCE",
  "SCORE_UNKNOWN_VERDICT_ID",
  "SCORE_MISSING_VERDICT",
  "SCORE_INVALID_VERDICT",
  "SCORE_DUPLICATE_VERDICT",
  "SCORE_INVALID_RUBRIC",
  "SCORE_INVALID_THRESHOLD",
  "UNSAFE_SCORE_PATH",
  "SCORE_INPUT_NOT_FOUND",
]);
