/**
 * @module lib/evals/score
 *
 * The scoring engine: turns a validated Rubric (`lib/evals/rubric.mjs`,
 * `loadRubric`) and a verdict set into a scored result. `scoreRubric` is
 * structured as a composition of small, ordered, named passes so later tasks
 * can extend it without rewriting it. This module currently implements the
 * first five passes — origin, threshold, and verdict-set validation, the
 * per-half tally (`tallyHalf`, excluding `not_applicable`/`unknown` from
 * each half's denominator, BEH-1/BEH-2), and the judged half's
 * insufficient-evidence guard (`isJudgedHalfInsufficient`, BEH-3) — and its
 * later passes (not-scored handling, result assembly, `buildJudgeContext`)
 * are added by Tasks 6-9.
 *
 * Pure Node.js built-ins only — no external dependencies (constitution
 * principle 1). This module reads no file, parses nothing, spawns no
 * process, and opens no network connection: everything it needs arrives
 * already loaded, as the caller-supplied Rubric and verdict set.
 */

import { codedError } from "../errors.mjs";
import { REQUIRED_TOP_LEVEL_KEYS, ELEMENT_VERDICTS, CRITERION_VERDICTS } from "./rubric-schema.mjs";
import { HALF_STATUS_INSUFFICIENT_EVIDENCE as INSUFFICIENT_EVIDENCE } from "./score-schema.mjs";

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
 * Tally one half (deterministic elements or judged criteria) against a set
 * of validated verdicts, excluding one verdict value from the denominator.
 *
 * `points = (met / answered) * pointsBudget` and `max = pointsBudget` — a
 * half's max is always its own budget, never `layer3_max_points` (BEH-1).
 * Nothing is rounded here: Task 8 rounds once, at the blend.
 *
 * This helper does not decide statuses (`NOT_SCORED`, `INSUFFICIENT_EVIDENCE`).
 * It is called only on the numeric rows of the verified partition (see the
 * base packet); Tasks 5-7 own the precondition that routes a half here, via
 * `resolveHalfStatus` (Task 7). Keeping the branch out of the tally is what
 * lets Task 7 assert that partition on the routing function alone.
 *
 * `answered === 0` is deliberately NOT defended against: it cannot reach
 * this helper once Tasks 5 and 6 land (a half with zero answered entries is
 * routed to `NOT_SCORED` or `INSUFFICIENT_EVIDENCE` before the tally runs),
 * and a guard here would create a second, silent status path competing with
 * the explicit one — the exact defect BEH-4 exists to prevent.
 *
 * @param {Array<{id: string}>} entries - the rubric's declared entries for
 *   this half (`required_elements` or `quality_dimensions`), in
 *   rubric-declaration order
 * @param {Map<string, string>} verdictsById - id -> resolved verdict value,
 *   for every id `assertVerdictSetValid` has already confirmed is legal
 * @param {{pointsBudget: number, excluded: string}} options - `pointsBudget`
 *   is the half's own budget (`required_element_points` or
 *   `judged_criterion_points`); `excluded` is the verdict value this half
 *   drops from its denominator (`not_applicable` for elements, `unknown`
 *   for criteria)
 * @returns {{met: number, answered: number, declared: number, excluded: number, points: number, max: number}}
 */
function tallyHalf(entries, verdictsById, { pointsBudget, excluded }) {
  let met = 0;
  let answered = 0;
  let excludedCount = 0;

  for (const entry of entries) {
    const value = verdictsById.get(entry.id);
    if (value === excluded) {
      excludedCount += 1;
      continue;
    }
    answered += 1;
    if (value === "met") met += 1;
  }

  return {
    met,
    answered,
    declared: entries.length,
    excluded: excludedCount,
    points: (met / answered) * pointsBudget,
    max: pointsBudget,
  };
}

/**
 * Decide whether the judged half's tally is trustworthy enough to report as
 * a number, per BEH-3.
 *
 * @param {{declared: number, excluded: number}} judgedTally - `tallyHalf`'s
 *   result for `quality_dimensions`; `excluded` is the `unknown` count,
 *   since `unknown` is the value `tallyHalf` excludes for this half
 * @param {number} threshold - `insufficient_evidence_threshold_percent`,
 *   already confirmed finite and within `[0, 100]` by `assertThresholdValid`
 * @returns {boolean}
 */
function isJudgedHalfInsufficient(judgedTally, threshold) {
  const declared = judgedTally.declared;
  const unknownCount = judgedTally.excluded;
  const share = declared === 0 ? 0 : (unknownCount / declared) * 100;
  // Clause 1 is NOT redundant with the threshold validation in assertThresholdValid().
  // `threshold: 100` is in range, and a share of 100 does not EXCEED 100 — so at that
  // threshold clause 2 never fires and clause 1 is the ONLY thing keeping an
  // all-unknown half off the numeric path, where it would divide by zero.
  // Review round 3 blocked on exactly this. Do not simplify it away.
  return (declared >= 1 && unknownCount === declared) || share > threshold;
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
 * A fourth pass — the per-half tally — runs once the verdict set is known
 * valid: `tallyHalf` is called once over `required_elements` (excluding
 * `not_applicable`) and once over `quality_dimensions` (excluding
 * `unknown`), each against its own points budget (BEH-1, BEH-2).
 *
 * A fifth pass — the judged half's insufficient-evidence guard
 * (`isJudgedHalfInsufficient`, BEH-3) — then decides whether the judged
 * half's tally is trustworthy enough to report as a number. When it is not,
 * the judged half's value becomes `{ status: "INSUFFICIENT_EVIDENCE",
 * points: null, max: null }` instead of the tally's number — `points` is
 * `null`, never `0`. The deterministic half is unaffected by this pass: it
 * always reports its own tally's points and max unchanged, regardless of
 * the judged half's status. `total` is present on every result and is
 * unconditionally `null` at this stage — Task 6 adds the deterministic
 * half's own `NOT_SCORED` routing, and Task 8 adds the `verdicts` table and
 * the numeric branch of `total` (rounding and the blend rule) this result
 * does not yet carry.
 *
 * @param {object} rubric - a Rubric returned by `loadRubric`
 * @param {any[]} verdictSet - the verdicts to score
 * @returns {{
 *   deterministic: {status: null, points: number, max: number},
 *   judged: {status: null, points: number, max: number} | {status: "INSUFFICIENT_EVIDENCE", points: null, max: null},
 *   total: null,
 * }}
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

  const verdictsById = new Map(verdictSet.map((entry) => [entry.id, entry.value]));

  const deterministicTally = tallyHalf(rubric.required_elements, verdictsById, {
    pointsBudget: rubric.required_element_points,
    excluded: "not_applicable",
  });
  const judgedTally = tallyHalf(rubric.quality_dimensions, verdictsById, {
    pointsBudget: rubric.judged_criterion_points,
    excluded: "unknown",
  });

  const judged = isJudgedHalfInsufficient(judgedTally, rubric.insufficient_evidence_threshold_percent)
    ? { status: INSUFFICIENT_EVIDENCE, points: null, max: null }
    : { status: null, points: judgedTally.points, max: judgedTally.max };

  // Task 8 owns the numeric branch of `total` (rounding and the blend rule).
  // At this stage no half is ever fully numeric-and-only-numeric across a
  // full run yet (Task 6 still owes NOT_SCORED), so `total` is unconditionally
  // `null` here — that is what this task's suite pins.
  return {
    deterministic: { status: null, points: deterministicTally.points, max: deterministicTally.max },
    judged,
    total: null,
  };
}
