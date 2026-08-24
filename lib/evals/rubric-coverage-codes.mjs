/**
 * @module lib/evals/rubric-coverage-codes
 *
 * The change-imminent tier's rubric-coverage error codes, declared as data.
 *
 * Spec: `.context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`,
 * section "Conformance Rules". Each code below is one row of that table.
 *
 * Registry placement decided by ADR-0019 Part A over the spec's own sentence:
 * an error-code set is a lib constant, not a test-local string literal, per
 * `lib/evals/catalog-codes.mjs:9-15` (which names this test file as the future
 * importer). `checkRubricSet` and its rule branches stay in
 * `tests/lib/evals/rubric-coverage.test.mjs` — this module holds only the
 * eleven strings.
 *
 * Frozen constants only: no functions, no I/O, no imports — the same shape as
 * `lib/evals/score-schema.mjs` and `lib/evals/catalog-codes.mjs`.
 */

/**
 * Every error code the rubric-coverage check may raise. These match the
 * spec's Conformance Rules table one-for-one. Array order is not the table's
 * order and carries no contract — consumers assert membership, so do not
 * treat an index as meaningful or "restore" it to the table's order.
 *
 * Only four of these eleven have implemented branches as of Task 1
 * (`RUBRIC_TIER_INCOMPLETE`, `RUBRIC_TIER_ORPHAN`, `RUBRIC_LANDED_INVALID`,
 * `RUBRIC_TIER_UNCOVERED`); the remaining seven land in Tasks 2 and 3. All
 * eleven are declared here now because this registry is the single spelling
 * every future importer reads, not a running tally of what exists yet.
 */
export const RUBRIC_COVERAGE_ERROR_CODES = Object.freeze([
  // The four `tiers.yaml` buckets do not partition `ls skills/` exactly —
  // a skill added later that silently belongs to no tier.
  "RUBRIC_TIER_INCOMPLETE",
  // A `rubrics/*.yaml` names a slug in no tier — a rubric nobody's coverage
  // claim accounts for.
  "RUBRIC_TIER_ORPHAN",
  // A token in `landed:` names no declared bucket key, or names `uncovered`
  // — two disjoint branches, each with its own rejecting input.
  "RUBRIC_LANDED_INVALID",
  // A slug in a bucket named by `tiers.yaml`'s `landed:` list has no
  // `rubrics/<slug>.yaml` — a bucket that reports complete while a skill
  // sits unguarded.
  "RUBRIC_TIER_UNCOVERED",
  // A rubric's `rubric_id` / `scenario` do not derive from its filename per
  // the shared per-skill rubric contract.
  "RUBRIC_ID_MISMATCH",
  // A rubric names a `scenario` with no `scenarios/<stem>.md` on disk.
  "RUBRIC_SCENARIO_MISSING",
  // A scenario's setup prose is missing one of the required token-table
  // steps.
  "RUBRIC_SCENARIO_STEP_MISSING",
  // An `artifact:` source resolves outside `fixture_root`.
  "RUBRIC_SOURCE_PATH_ESCAPE",
  // A `skill-regression:<PV-nn|KC-nn>` citation's id token fails the
  // documented shape.
  "RUBRIC_EXCEPTION_ID_MALFORMED",
  // A rubric's deterministic `required_elements` count or judged
  // `quality_dimensions` count falls outside the shared contract's floors
  // and ceilings.
  "RUBRIC_ELEMENT_FLOOR",
  // A detector rubric cites a planted-violation catalog id without also
  // citing its known-clean twin.
  "RUBRIC_TWIN_UNCITED",
]);
