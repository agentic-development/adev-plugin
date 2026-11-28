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
 * `skills/eval/references/default-rubric.yaml`.
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
 * Top-level keys whose value must be a list (BEH-9, rubric-schema-and-loader
 * rev 2). Every entry-level pass in `lib/evals/rubric.mjs` (completeness,
 * verdict legality, legacy-weight, uniqueness) assumes `document[key]` is an
 * array once the loader reaches it; this is the single list the loader
 * consults to enforce that assumption before any of them run, rather than
 * each pass re-declaring its own membership test. An empty list is not a
 * fault — it is the sanctioned way to declare "no entries of this kind".
 */
export const LIST_TYPED_KEYS = Object.freeze(["required_elements", "quality_dimensions"]);

/**
 * The entry key that identifies one entry within its list. Required on both
 * `required_elements` and `quality_dimensions` entries (`REQUIRED_ELEMENT_FIELDS`
 * and `REQUIRED_CRITERION_FIELDS` both list it); a missing one raises
 * `RUBRIC_INCOMPLETE_ELEMENT` / `RUBRIC_INCOMPLETE_CRITERION`, not a separate
 * code of its own.
 */
export const ID_FIELD = "id";

/**
 * The entry key that carries a DECLARED verdict. Legal, and optional, on both
 * `required_elements` entries (checked against `ELEMENT_VERDICTS`) and
 * `quality_dimensions` entries (checked against `CRITERION_VERDICTS`) — a
 * value outside the applicable enum raises `RUBRIC_INVALID_VERDICT`. Neither
 * `REQUIRED_ELEMENT_FIELDS` nor `REQUIRED_CRITERION_FIELDS` lists it, because a
 * verdict is what SCORING produces, not what authoring must declare.
 */
export const VERDICT_FIELD = "verdict";

/**
 * The entry key a PRE-MIGRATION `quality_dimensions` entry carried to weight
 * one judged criterion against another on the historical 1-5 scale. The
 * binary-verdict schema has no such field — neither `REQUIRED_CRITERION_FIELDS`
 * nor any `quality_dimensions` entry-level key list in this module declares
 * it — so a NUMERIC value here is illegal and raises `RUBRIC_LEGACY_SCALE`
 * rather than being accepted. Scoped to `quality_dimensions`: a
 * `required_elements` entry is deterministic and was never weighted, so the
 * key is left unpoliced there.
 */
export const WEIGHT_FIELD = "weight";

/**
 * Every error code a rubric load or validation may raise. The first ten match
 * the spec's Error Cases table one-for-one and are ordered as that table orders
 * them.
 *
 * `RUBRIC_PARSE_ERROR` is appended beyond the table: it covers a rubric file
 * that is readable but not parseable — a YAML syntax fault, or a document that
 * parses to something other than a top-level map. The spec's Error Cases table
 * does not enumerate this case, but the loader must still surface it with a
 * `RUBRIC_`-prefixed code rather than letting the YAML reader's own exception
 * escape uncoded to a caller. It is distinct from `RUBRIC_NOT_FOUND`, which
 * covers a missing or unreadable file.
 *
 * `RUBRIC_INVALID_LIST_SHAPE` is likewise appended beyond the base spec's
 * table: it is BEH-9's code, added by `rubric-schema-and-loader` rev 2 (the
 * base spec is immutable; the amendment carries the new Error Cases row) for a
 * `LIST_TYPED_KEYS` key present with a non-array value.
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
  "RUBRIC_PARSE_ERROR",
  "RUBRIC_INVALID_LIST_SHAPE",
]);
