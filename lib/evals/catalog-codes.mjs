/**
 * @module lib/evals/catalog-codes
 *
 * The ground-truth catalog's integrity error codes, declared as data.
 *
 * Spec: `.context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`,
 * section "Catalog Integrity Rules". Each code below is one row of that table.
 *
 * This is a registry, not a validator: ADR-0019 Part A makes an error-code set
 * a lib constant so it is machine-readable, and a test-local string literal
 * cannot be imported. The Tier A integrity check
 * (`tests/lib/evals/skill-regression-catalog.test.mjs`) and the change-imminent
 * tier's rubric-coverage test (not yet written) will read this array rather than
 * re-spelling the strings, which is what makes "one emitted code, one spelling"
 * a construction rather than a convention.
 *
 * Frozen constants only: no functions, no I/O, no imports — the same shape as
 * `lib/evals/score-schema.mjs`.
 */

/**
 * Every error code the catalog-integrity check may raise. These match the
 * spec's Catalog Integrity Rules table one-for-one. Array order is not the
 * table's order and carries no contract — consumers assert membership, so do
 * not treat an index as meaningful or "restore" it to the table's order.
 */
export const CATALOG_ERROR_CODES = Object.freeze([
  // Any value is a map, or a list item holds a list or a map. The minimal YAML
  // reader loads a valueless key as `{}`, so a block that failed to load is
  // indistinguishable from silence and the catalog scores as empty.
  "CATALOG_NESTED_MAP",
  // A top-level key or an entry field is absent — an entry that parses but
  // cannot be resolved.
  "CATALOG_MISSING_KEY",
  // Two entries share an `id`, so a rubric citation resolves to whichever
  // entry parsed last.
  "CATALOG_DUPLICATE_ID",
  // A `PV` names a `KC` that does not name it back, or the two carry different
  // `class` values — a sensitivity assertion shipped with no specificity
  // control.
  "CATALOG_UNPAIRED_TWIN",
  // An entry `path` resolves outside `fixture_root`, making the fixture
  // non-hermetic by reference. Decided lexically, before any filesystem call.
  "CATALOG_PATH_ESCAPE",
  // An entry `path` does not exist on disk — ground truth asserted about a
  // file nobody wrote.
  "CATALOG_PATH_MISSING",
  // A value coerces on reparse (a bare digit string, `true`/`false`/`null`, an
  // empty string), or carries a flow indicator or colon-space; a
  // `covers_skills` / `read_by` component fails `^[a-z][a-z0-9-]*$`;
  // `catalog_id` fails the same pattern; `fixture_root` is not exactly
  // `project`. Five sub-conditions under one code, each separately provable.
  "CATALOG_UNSAFE_SCALAR",
  // A spec's `status:` frontmatter and its `lifecycle-state/*.jsonl` event
  // chain disagree, per the pairs declared in Seed Content — routing ground
  // truth saying one thing in frontmatter and another in the log `/adev:work`
  // actually reads.
  "CATALOG_STATUS_EVENT_MISMATCH",
  // A `scaffolding` entry's `role` is outside the documented enum: a typo'd
  // `role: constitition` that parses, validates, and means nothing.
  "CATALOG_ROLE_UNKNOWN",
  // An entry's `anchor` occurs zero times or more than once in its `path` —
  // the catalog pointing at a defect site that moved or multiplied, silently.
  "CATALOG_ANCHOR_NOT_UNIQUE",
  // `orders-verdicts.json` fails to parse, or carries a verdict id absent from
  // `orders-rubric.yaml` — a scaffolding pair that drifts silently and
  // surfaces inside a tier scenario as `SCORE_INPUT_PARSE_ERROR`.
  "CATALOG_VERDICT_IDS_UNRESOLVED",
  // A `covers_skills` or `read_by` slug names no skill under `skills/` — a
  // rubric tier authored against a skill that does not exist.
  "CATALOG_UNKNOWN_SKILL",
  // A rubric's `source` cites `<catalog_id>:<id>` and no such id exists — a
  // rubric asserting against nothing while scoring green. The growth rule's
  // enforcement point, and the only rule that reads outside the fixture.
  "CATALOG_UNRESOLVED_CITATION",
]);
