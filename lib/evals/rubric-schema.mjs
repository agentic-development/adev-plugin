/**
 * @module lib/evals/rubric-schema
 *
 * The Layer 3 rubric schema, declared as data.
 *
 * This module IS the schema: it is the single place a reviewer reads to learn
 * the rubric contract — which top-level keys a rubric must carry, which
 * verdicts each entry kind may take, which fields each entry must declare, and
 * which error codes a rubric failure may raise. It holds frozen constants only:
 * no functions, no I/O, no imports. `lib/evals/rubric.mjs` is the executable
 * expression of these constants (loading, validating and reporting against
 * them); it must never restate the contract, only consume it.
 *
 * Verified against `skills/eval/SKILL.md` ("Rubric resolution") and the shipped
 * `skills/eval/default-rubric.yaml`.
 */

/**
 * Top-level keys every rubric must declare, in the shipped rubric's order.
 * A rubric missing any of these is rejected with `RUBRIC_MISSING_KEY`.
 */
export const REQUIRED_TOP_LEVEL_KEYS = Object.freeze([
  "rubric_id",
  "version",
  "layer",
  "verdict_values",
  "required_elements",
  "quality_dimensions",
  "layer3_max_points",
  "required_element_points",
  "judged_criterion_points",
  "unknown_policy",
  "not_applicable_policy",
  "insufficient_evidence_threshold_percent",
]);

/**
 * Top-level keys a rubric may declare but need not.
 *
 * `budget_max_*` names the budget family by convention only: individual budget
 * keys are recognised by matching `BUDGET_KEY_PATTERN`, not by literal
 * membership in this list, so a new `budget_max_<unit>` key needs no edit here.
 */
export const OPTIONAL_TOP_LEVEL_KEYS = Object.freeze([
  "skill",
  "scenario",
  "budget_max_*",
]);

/**
 * Verdicts a deterministic `required_elements` entry may resolve to. A
 * deterministic check either applies and answers, or does not apply — it never
 * resolves to `unknown`.
 */
export const ELEMENT_VERDICTS = Object.freeze(["met", "not_met", "not_applicable"]);

/**
 * Verdicts a judged `quality_dimensions` entry may resolve to. `unknown` is a
 * first-class verdict for a judge that cannot tell; `not_applicable` is not
 * available, since a judged criterion is either decided or unknown.
 */
export const CRITERION_VERDICTS = Object.freeze(["met", "not_met", "unknown"]);

/**
 * Fields every `required_elements` entry must declare. A missing field raises
 * `RUBRIC_INCOMPLETE_ELEMENT`.
 */
export const REQUIRED_ELEMENT_FIELDS = Object.freeze(["id", "source", "met_when"]);

/**
 * Fields every `quality_dimensions` entry must declare. A missing field raises
 * `RUBRIC_INCOMPLETE_CRITERION`.
 */
export const REQUIRED_CRITERION_FIELDS = Object.freeze([
  "id",
  "criterion",
  "reference",
  "met_when",
  "not_met_when",
  "unknown_when",
]);

/**
 * The only accepted form for an optional budget key. Non-global on purpose:
 * a `/g` regex carries `lastIndex` state across `.test()` calls and would make
 * repeated checks non-deterministic.
 */
export const BUDGET_KEY_PATTERN = Object.freeze(/^budget_max_[a-z0-9_]+$/);

/**
 * Every error code a rubric load or validation may raise, matching the spec's
 * Error Cases table.
 */
export const RUBRIC_ERROR_CODES = Object.freeze([
  "RUBRIC_NESTED_MAP",
  "RUBRIC_MISSING_KEY",
  "RUBRIC_INVALID_VERDICT",
  "RUBRIC_INCOMPLETE_ELEMENT",
  "RUBRIC_INCOMPLETE_CRITERION",
  "RUBRIC_INVALID_BUDGET",
  "UNSAFE_RUBRIC_PATH",
  "RUBRIC_LEGACY_SCALE",
  "RUBRIC_NOT_FOUND",
  "RUBRIC_DUPLICATE_ID",
]);
