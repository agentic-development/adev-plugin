/**
 * @module lib/evals/score
 *
 * The scoring engine: turns a validated Rubric (`lib/evals/rubric.mjs`,
 * `loadRubric`) and a verdict set into a scored result. `scoreRubric` is
 * structured as a composition of small, ordered, named passes so later tasks
 * can extend it without rewriting it. This module currently implements only
 * the first three passes — origin, threshold, and verdict-set validation —
 * and its later passes (per-half tally, the insufficient-evidence guard,
 * not-scored handling, result assembly, `buildJudgeContext`) are added by
 * Tasks 4-9.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1). This module reads no file, parses nothing, spawns no
 * process, and opens no network connection: everything it needs arrives
 * already loaded, as the caller-supplied Rubric and verdict set.
 */

import { codedError } from "../errors.mjs";
import { REQUIRED_TOP_LEVEL_KEYS, ELEMENT_VERDICTS, CRITERION_VERDICTS } from "./rubric-schema.mjs";

/**
 * Build the `SCORE_INVALID_RUBRIC` error.
 *
 * `loadRubric` returns the validated parsed document itself, with no brand
 * or marker attached — the validated document IS the Rubric. So this check
 * is necessarily structural rather than an identity or brand check: an
 * object produced any other way, however plausible its shape, is rejected
 * unless it happens to declare every required top-level key with both entry
 * lists present as arrays.
 *
 * @returns {Error}
 */
function invalidRubricError() {
  return codedError(
    "SCORE_INVALID_RUBRIC",
    "SCORE_INVALID_RUBRIC: rubric argument is not a Rubric produced by " +
      "loadRubric() — it does not declare every required top-level key " +
      "(rubric-schema.mjs REQUIRED_TOP_LEVEL_KEYS) with required_elements " +
      "and quality_dimensions present as arrays. Load the rubric with " +
      "loadRubric() before scoring it.",
  );
}

/**
 * True for a value the YAML reader (and therefore `loadRubric`) could have
 * produced as a map — an object that is neither null nor an array.
 *
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Assert that `rubric` is structurally a Rubric produced by `loadRubric`.
 *
 * `loadRubric` returns the validated parsed document with no brand or
 * marker (see the module doc), so the only origin check available to a
 * consumer is structural: every key in `REQUIRED_TOP_LEVEL_KEYS` must be
 * declared, and the two entry lists (`required_elements`,
 * `quality_dimensions`) must be present as arrays — the shape every later
 * pass in this module assumes it can iterate. This is deliberately looser
 * than `loadRubric`'s own ten validation passes: re-deriving those here
 * would fork the loader's contract into two places that could drift, which
 * the base packet's "consume, never fork" rule forbids. It is exactly loose
 * enough to catch a hand-rolled object that never went through the loader.
 *
 * @param {any} rubric
 * @throws {Error} `code: 'SCORE_INVALID_RUBRIC'`
 */
function assertRubricOrigin(rubric) {
  if (!isPlainObject(rubric)) throw invalidRubricError();

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in rubric)) throw invalidRubricError();
  }

  if (!Array.isArray(rubric.required_elements)) throw invalidRubricError();
  if (!Array.isArray(rubric.quality_dimensions)) throw invalidRubricError();
}

/**
 * Build the `SCORE_INVALID_THRESHOLD` error, naming the offending value.
 *
 * `JSON.stringify` renders the value so a string ("forty") and a number
 * (140) both read unambiguously in the message — the two fixtures this
 * error type must serve name their offending value by matching a bare
 * substring (`forty`, `140`), so the raw stringified value must appear
 * verbatim in the message.
 *
 * @param {any} value - the declared threshold, exactly as the rubric carries it
 * @returns {Error}
 */
function invalidThresholdError(value) {
  return codedError(
    "SCORE_INVALID_THRESHOLD",
    "SCORE_INVALID_THRESHOLD: insufficient_evidence_threshold_percent " +
      `${JSON.stringify(value)} is not a finite number within [0, 100].`,
  );
}

/**
 * Assert that the Rubric's `insufficient_evidence_threshold_percent` is a
 * finite number within `[0, 100]` (BEH-10).
 *
 * `loadRubric` validates that this top-level key is PRESENT, never that it
 * is well-typed (see `assertRequiredKeysPresent` in `lib/evals/rubric.mjs`),
 * so a non-numeric value passes the loader silently. That silence is the
 * whole reason this pass exists: a non-numeric threshold coerces to `NaN`
 * under any `>` comparison, and every share comparison against `NaN`
 * returns `false` — so BEH-3's second clause ("unknown share exceeds the
 * threshold") would never fire for ANY verdict set while the rubric still
 * looked perfectly valid. Re-validating this one field of an
 * already-validated Rubric does not make this module a loader: it reads no
 * file and parses nothing.
 *
 * `100` is explicitly IN range — see the base packet's CRITICAL
 * implementation constraint. Task 5's `threshold: 100` case depends on this
 * boundary being accepted here so that BEH-3's threshold-independent first
 * clause remains the sole guard against an all-`unknown` judged half at
 * that threshold.
 *
 * This pass runs strictly after `assertRubricOrigin` and strictly before
 * any verdict-set validation or tallying: a rubric with both a bad
 * threshold and an invalid verdict set must report the threshold fault,
 * because "before any tallying" is an ordering guarantee this module makes,
 * not an implementation detail.
 *
 * @param {object} rubric - a Rubric already confirmed to have a valid origin
 * @throws {Error} `code: 'SCORE_INVALID_THRESHOLD'` naming the offending value.
 */
function assertThresholdValid(rubric) {
  const value = rubric.insufficient_evidence_threshold_percent;
  if (Number.isFinite(value) && value >= 0 && value <= 100) return;
  throw invalidThresholdError(value);
}

/**
 * Build the declared-id index: every id the rubric declares, across both
 * entry lists, mapped to its kind. `element` ids come from
 * `required_elements` (deterministic), `criterion` ids from
 * `quality_dimensions` (judged) — the same two lists `assertRubricOrigin`
 * already confirmed are present as arrays. Iteration order is
 * rubric-declaration order (elements first, then criteria), which is the
 * order `SCORE_MISSING_VERDICT` reports a missing id in.
 *
 * @param {object} rubric - a Rubric already confirmed to have a valid origin
 * @returns {Map<string, "element"|"criterion">}
 */
function buildDeclaredIdIndex(rubric) {
  const index = new Map();
  for (const element of rubric.required_elements) index.set(element.id, "element");
  for (const criterion of rubric.quality_dimensions) index.set(criterion.id, "criterion");
  return index;
}

/**
 * True for empty or whitespace-only evidence.
 *
 * @param {any} evidence
 * @returns {boolean}
 */
function isEmptyEvidence(evidence) {
  return typeof evidence !== "string" || evidence.trim() === "";
}

/**
 * Assert that `verdictSet` is a complete, well-formed set of verdicts against
 * `rubric`'s declared ids (BEH-5, BEH-6).
 *
 * Walks the supplied verdicts once, in a fixed per-entry order — duplicate,
 * then unknown id, then illegal enum value for the id's kind, then empty
 * evidence on `met`/`not_met` — then diffs the declared-id index against the
 * ids the walk saw, for `SCORE_MISSING_VERDICT`. The per-entry order matters:
 * a repeated verdict for a known id must report `SCORE_DUPLICATE_VERDICT`
 * before any later check could fire for that same entry, and an id the
 * rubric never declared cannot be classified by kind, so unknown-id must be
 * resolved before the enum check runs.
 *
 * Enum membership is tested against `ELEMENT_VERDICTS` /
 * `CRITERION_VERDICTS`, imported from `rubric-schema.mjs` — never restated
 * as a literal list here. The two enums are deliberately different sets: a
 * `RequiredElement` never resolves to `unknown`, and a `QualityCriterion`
 * never resolves to `not_applicable` (charter invariant). `unknown` is not
 * `met`/`not_met`, so the empty-evidence check never applies to it — an
 * `unknown` verdict with empty evidence is legal, since absence of evidence
 * is expressible only as `unknown`.
 *
 * This pass returns nothing and only throws or falls through: no arithmetic
 * runs here, so a rejected verdict set produces no partial score (spec
 * postcondition).
 *
 * @param {object} rubric - a Rubric already confirmed to have a valid origin
 *   and a valid threshold
 * @param {any[]} verdictSet - the verdicts to validate
 * @throws {Error} `code: 'SCORE_DUPLICATE_VERDICT'` naming the id
 * @throws {Error} `code: 'SCORE_UNKNOWN_VERDICT_ID'` naming the id
 * @throws {Error} `code: 'SCORE_INVALID_VERDICT'` naming the id and the
 *   illegal value, id first
 * @throws {Error} `code: 'SCORE_EMPTY_EVIDENCE'` naming the id
 * @throws {Error} `code: 'SCORE_MISSING_VERDICT'` naming the first declared
 *   id (in rubric-declaration order) the verdict set omits
 */
function assertVerdictSetValid(rubric, verdictSet) {
  const declared = buildDeclaredIdIndex(rubric);
  const seen = new Set();

  for (const entry of verdictSet) {
    const { id, value, evidence } = entry;

    if (seen.has(id)) {
      throw codedError(
        "SCORE_DUPLICATE_VERDICT",
        `SCORE_DUPLICATE_VERDICT: verdict id "${id}" appears more than once in the verdict set.`,
      );
    }

    const kind = declared.get(id);
    if (kind === undefined) {
      throw codedError(
        "SCORE_UNKNOWN_VERDICT_ID",
        `SCORE_UNKNOWN_VERDICT_ID: verdict id "${id}" is not declared by the rubric's ` +
          "required_elements or quality_dimensions.",
      );
    }

    const allowedVerdicts = kind === "element" ? ELEMENT_VERDICTS : CRITERION_VERDICTS;
    if (!allowedVerdicts.includes(value)) {
      throw codedError(
        "SCORE_INVALID_VERDICT",
        `SCORE_INVALID_VERDICT: verdict id "${id}" resolved to "${value}", which is not a ` +
          `legal verdict for a ${kind === "element" ? "RequiredElement" : "QualityCriterion"} ` +
          `(allowed: ${allowedVerdicts.join(", ")}).`,
      );
    }

    if ((value === "met" || value === "not_met") && isEmptyEvidence(evidence)) {
      throw codedError(
        "SCORE_EMPTY_EVIDENCE",
        `SCORE_EMPTY_EVIDENCE: verdict id "${id}" resolved to "${value}" but carries no ` +
          "evidence — absence of evidence is expressible only as \"unknown\".",
      );
    }

    seen.add(id);
  }

  for (const id of declared.keys()) {
    if (!seen.has(id)) {
      throw codedError(
        "SCORE_MISSING_VERDICT",
        `SCORE_MISSING_VERDICT: the rubric declares id "${id}" but the verdict set omits it.`,
      );
    }
  }
}

/**
 * Score a Rubric against a verdict set.
 *
 * Composed of small, ordered, named passes; the order is load-bearing and
 * decides which error a rubric or verdict set with several faults receives.
 * At this stage the composition is:
 *
 *   1. origin — `rubric` must be structurally a Rubric produced by
 *      `loadRubric` (`SCORE_INVALID_RUBRIC`).
 *   2. threshold — `insufficient_evidence_threshold_percent` must be a
 *      finite number within `[0, 100]` (`SCORE_INVALID_THRESHOLD`), BEH-10.
 *   3. verdict set — `verdictSet` must name exactly the ids the rubric
 *      declares, each resolving to a legal verdict for its kind with
 *      evidence when `met`/`not_met`, no duplicates (`SCORE_DUPLICATE_VERDICT`,
 *      `SCORE_UNKNOWN_VERDICT_ID`, `SCORE_INVALID_VERDICT`,
 *      `SCORE_EMPTY_EVIDENCE`, `SCORE_MISSING_VERDICT`), BEH-5, BEH-6.
 *
 * All three passes run to completion before any arithmetic: "a rejected
 * verdict set produces no partial score" (spec postcondition) starts here —
 * a rubric or verdict set that fails any check produces no result object at
 * all, partial or otherwise.
 *
 * Later tasks add further passes (per-half tally, the insufficient-evidence
 * guard, not-scored handling, result assembly) in this same ordered
 * composition. Until then, `scoreRubric` returns `undefined` once all three
 * passes above succeed — there is no result shape to return until a later
 * task adds the tally.
 *
 * @param {object} rubric - a Rubric returned by `loadRubric`
 * @param {any[]} verdictSet - the verdicts to score
 * @returns {undefined}
 * @throws {Error} `code: 'SCORE_INVALID_RUBRIC'` if `rubric` did not
 *   originate from `loadRubric`.
 * @throws {Error} `code: 'SCORE_INVALID_THRESHOLD'` if
 *   `insufficient_evidence_threshold_percent` is non-numeric or outside
 *   `[0, 100]`.
 * @throws {Error} `code: 'SCORE_DUPLICATE_VERDICT'`, `'SCORE_UNKNOWN_VERDICT_ID'`,
 *   `'SCORE_INVALID_VERDICT'`, `'SCORE_EMPTY_EVIDENCE'`, or
 *   `'SCORE_MISSING_VERDICT'` if `verdictSet` is malformed against `rubric`.
 */
export function scoreRubric(rubric, verdictSet) {
  assertRubricOrigin(rubric);
  assertThresholdValid(rubric);
  assertVerdictSetValid(rubric, verdictSet);
}
