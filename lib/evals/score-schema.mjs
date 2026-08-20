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
 * The judged half's value in place of a number when the judges answered
 * `unknown` too often (or exclusively) to trust the numeric result.
 */
export const HALF_STATUS_INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE";

/**
 * A half's value in place of a number when no rubric entry applied to that
 * half at all.
 */
export const HALF_STATUS_NOT_SCORED = "NOT_SCORED";

/**
 * The statuses a scored half may report instead of a number. A half's value
 * is a number or one of these, never a number standing in for the absence of
 * one: `0` means "scored, and earned nothing". Carries no ordering
 * guarantee beyond membership — consumers must not destructure this array
 * positionally; import the named constants above instead.
 */
export const HALF_STATUSES = Object.freeze([HALF_STATUS_INSUFFICIENT_EVIDENCE, HALF_STATUS_NOT_SCORED]);

/**
 * The verdict kind naming a deterministic `required_elements` entry.
 */
export const VERDICT_KIND_ELEMENT = "element";

/**
 * The verdict kind naming a judged `quality_dimensions` entry.
 */
export const VERDICT_KIND_CRITERION = "criterion";

/**
 * The two kinds a scored verdict entry may carry, naming the two rubric
 * lists a verdict can originate from and nothing else: `element` for a
 * deterministic `required_elements` entry, `criterion` for a judged
 * `quality_dimensions` entry.
 */
export const VERDICT_KINDS = Object.freeze([VERDICT_KIND_ELEMENT, VERDICT_KIND_CRITERION]);

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
  // SCORE_INVALID_VERDICT_CONTEXT is not in the spec's Error Cases table,
  // which enumerates nine. It is a defensive addition serving BEH-7's
  // isolation guarantee — handing the whole rubric to buildJudgeContext (a
  // builder that copies an allow-list) would otherwise silently return an
  // object of `undefined`s rather than fail — not a contradiction of the
  // spec. If a later reading treats the Error Cases table as closed over
  // the code vocabulary, add a one-line row for it to the spec rather than
  // dropping the check.
  "SCORE_INVALID_VERDICT_CONTEXT",
  // SCORE_INPUT_PARSE_ERROR is appended beyond the table too: it covers a
  // verdict-set input file (the CLI verb's --input) that is readable but not
  // parseable — a JSON syntax fault. The spec's Error Cases table does not
  // enumerate this case, but the verb must still surface it with a
  // `SCORE_`-prefixed code rather than letting JSON.parse's own exception
  // escape uncoded to a caller branching on `.code`. It is distinct from
  // `SCORE_INPUT_NOT_FOUND`, which covers a missing or unreadable file.
  "SCORE_INPUT_PARSE_ERROR",
]);
