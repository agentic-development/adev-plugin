---
partial_schema: spec@1
charter: eval-harness
kind: behavioral
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 4
created: 2026-08-21
updated: 2026-08-21
---

# Live Spec: Baseline Provenance and Percent Regression

<!-- Live Spec within the eval-harness charter.
     Parent Charter: .context-index/specs/features/eval-harness/charter.md
     Delivers the charter capability "Baseline provenance and percent-regression",
     which owns the ScoreComparison entity.
     Depends on: Run-cost record (unspecified) for the RunRecord a Baseline stores.
     This spec is written against the RunRecord contract the charter's Domain Model
     already pins, and does not author it. -->

## Behavioral Contract

A Baseline is one scored run, stored with enough provenance to know whether a later
run is comparable to it at all. A ScoreComparison is the answer to one question —
*did quality drop?* — expressed so that the answer cannot be overstated.

The whole design pressure here is in one direction: **judged verdicts move on their
own.** The charter records the measurement — the same audit pass, given byte-identical
instructions and identical inputs, produced three findings on one run and one on the
next. A comparison that folds that movement into a single number will report
regressions that are not there, and a team that sees three false regressions stops
reading the fourth. So the comparison splits the delta into a deterministic half and a
judged half, and **only the deterministic half can produce a `regression` verdict.**
Judged movement, in either direction, is reported as `judge-attributable` — visible,
quantified, and explicitly not something to act on.

That rule has a consequence worth stating plainly, because it is the capability's main
limitation rather than a detail: **a quality drop that shows up only in judged criteria
will never be called a regression by this comparison.** The way to make such a drop
detectable is to give it a deterministic signal — which is exactly what the charter's
Disclosure Fidelity capability does by making an observed read trace a
`required_elements` source. Baseline comparison and disclosure fidelity are not
independent features; the second is what gives the first teeth.

## System Constitution Reference

- **Principle 1, "Minimize external dependencies"** — Node built-ins only. Baselines
  are JSON, read with `JSON.parse`; no serialization library and no new dependency.
- **Principle 3, "Pure ESM"** — `lib/evals/baseline.mjs` and
  `lib/evals/baseline-schema.mjs` are ESM, matching the `rubric.mjs` /
  `rubric-schema.mjs` and `score.mjs` / `score-schema.mjs` pairs already shipped.
- **Charter Quality Attribute, "Determinism"** — "No clock reads and no randomness
  anywhere in the scoring path." A Baseline carries `recorded_at`, so the timestamp is
  **injected by the caller**, never read inside the library. BEH-10 makes that testable.
- **Charter Quality Attribute, "Observability"** — "A numeric aggregate is never
  reported without its verdict table." A comparison result carries both sides' verdict
  tables, not only the deltas.
- **Charter Quality Attribute, "Security"** — Baseline paths are validated against
  traversal, following the `UNSAFE_RUBRIC_PATH` / `UNSAFE_SCORE_PATH` precedent.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| `baseline-schema.mjs` | Frozen constants: outcome enum, required Baseline fields, error codes. Data only, no I/O — the established schema-module shape | small |
| `recordBaseline` / `loadBaseline` | Write and read a baseline with path containment and injected `recorded_at`; refuse silent overwrite | medium |
| `compareScores` | The outcome decision procedure, the two-half delta split, and percent normalisation | large |
| Provenance gate | `incomparable` on differing `model_id` or `pricing_table` | small |
| Trace-staleness pass-through | `TRACE_FIXTURE_STALE` surfaced from the disclosure-fidelity check when present | small |
| `adev eval baseline` / `adev eval compare` | CLI verbs wrapping the three functions, `--json` output | medium |
| Charter revision | Add `no_regression` to the `outcome` enum and the three functions to Interface Contracts | small |

## Visual Expectations

Not applicable — no UI surface. The CLI verbs print a verdict table and the two deltas;
`--json` emits the ScoreComparison object verbatim.

## Preconditions

- A rubric loads through `lib/evals/rubric.mjs::loadRubric` without error.
- Both sides of a comparison were scored by `lib/evals/score.mjs::scoreRubric` against
  **the same `rubric_id` at the same `version`**. A rubric version change makes two
  scores incommensurable in a way provenance cannot repair, so it is a precondition
  rather than an `incomparable` verdict.
- Each side carries a RunRecord naming its `model_id`, `plugin_version`, and
  `pricing_table`, per the charter invariant "Every RunRecord names the model id and
  plugin version that produced it".

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `recordBaseline(rubricId, runRecord, score, { recordedAt })` is called with a rubric id that has no stored baseline **then** a baseline is written to `.context-index/evals/baselines/<rubric_id>.json` carrying `rubric_id`, `run_record`, `score`, `recorded_at`, `model_id`, and `plugin_version`.
- **BEH-2** — **When** `recordBaseline` is called for a rubric id that already has a stored baseline **and** `promote: true` was not passed **then** it raises `BASELINE_EXISTS` and writes nothing. Promotion is a curated step, mirroring the charter's rule that a fresh Tier C capture never auto-replaces a committed trace fixture: a run that already carries the regression would otherwise install it as the new expectation.
- **BEH-3** — **When** `compareScores(baseline, candidate)` is given two sides whose `model_id` differs, or whose `pricing_table` differs **then** it returns `outcome: "incomparable"` naming which field diverged, and reports no deltas. A differing `plugin_version` does **not** trigger this — comparing across plugin versions is the entire purpose.
- **BEH-4** — **When** `compareScores` is given comparable sides **then** the result carries `deterministic_delta` and `judged_delta` as separate fields, always, whatever the outcome. Neither is ever summed into the other.
- **BEH-5** — **When** the candidate's deterministic half scores below the baseline's **then** the outcome is `regression`, regardless of which way the judged half moved.
- **BEH-6** — **When** the deterministic halves are identical **and** the judged half moved in either direction **then** the outcome is `judge-attributable`, never `regression`. Decidable from one run per side; no sampling required.
- **BEH-7** — **When** neither half moved negatively **then** the outcome is `no_regression`. The deltas carry direction and magnitude, so an improvement needs no separate outcome value.
- **BEH-8** — **When** a delta is computed **then** it is expressed as a percentage of that half's **attainable maximum** on the baseline side, not as an absolute point difference — so a rubric that grows or shrinks its element count does not read as a quality change.
- **BEH-9** — **When** either side's half is `NOT_SCORED` or `INSUFFICIENT_EVIDENCE` rather than a number **then** that half's delta is reported as `null`, never as `0`. A half that was not scored has not held steady; conflating the two is how an unscored run reports as healthy.
- **BEH-10** — **When** `compareScores` runs **then** it reads no clock and draws no randomness: given the same two inputs it returns a byte-identical result. `recorded_at` is supplied by the caller at record time and is only ever read back, never generated inside the comparison.
- **BEH-11** — **When** a comparison result is produced **then** it carries both sides' full verdict tables alongside the deltas, so the charter invariant "a numeric aggregate is never reported without its verdict table" holds for comparisons as well as for scores.
- **BEH-12** — **When** the disclosure-fidelity check reports that a trace fixture's recorded pointer set no longer matches the skill's current pointer set **then** the outcome is `TRACE_FIXTURE_STALE`, naming the fixture and the drifted pointers — neither passing nor reporting a regression.
- **BEH-13** — **When** any comparison is reported **then** it claims no spread and no variance, because a single judged run per side supplies none to measure. Spread and the `indistinguishable` outcome arrive with judged-verdict sampling at v2.

## Postconditions

- A stored baseline is a complete, self-describing record: it can be compared against
  without loading the run that produced it.
- A ScoreComparison names exactly one `outcome` from the closed enum, and that outcome
  is reproducible from the two inputs alone.
- No comparison reports `regression` on the strength of judged movement.
- Any finding detected but not selected as the outcome — a stale trace fixture behind an
  `incomparable` provenance mismatch, for instance — is still carried in the result's
  `findings` list rather than dropped, so one round trip surfaces every problem.

## Outcome Decision Procedure

The outcome enum is closed, so the mapping from state to outcome must be total. Rows
are evaluated top to bottom; the first match wins.

| # | Condition | Outcome |
|---|---|---|
| 1 | `model_id` or `pricing_table` differs between sides | `incomparable` |
| 2 | Either side's deterministic half is `NOT_SCORED` | `incomparable` |
| 3 | The disclosure-fidelity check reports a drifted pointer set | `TRACE_FIXTURE_STALE` |
| 4 | `deterministic_delta < 0` | `regression` |
| 5 | `deterministic_delta == 0` and `judged_delta != 0` | `judge-attributable` |
| 6 | otherwise | `no_regression` |

Row 1 precedes row 3 deliberately: provenance is decidable from metadata alone, without
loading a verdict table or a trace, so it is the cheapest check and the one that makes
every later check moot. It does **not** hide the staleness — row 3's finding is still
recorded in `findings` per the postcondition above, so a single run surfaces both the
model mismatch and the stale fixture.

Row 2 exists because a `NOT_SCORED` deterministic half means the rubric contributed no
deterministic elements to that run. With no deterministic signal on one side, rows 4–6
would decide the outcome entirely on judged movement, which BEH-6 forbids. Returning
`incomparable` is the honest answer; returning `judge-attributable` would imply the
deterministic halves were compared and found identical.

A judged half that is `INSUFFICIENT_EVIDENCE` is **not** grounds for `incomparable`:
`judged_delta` reports `null` per BEH-9 and rows 4–6 proceed on the deterministic half
alone. The deterministic half is the only one that can produce `regression` anyway, so
an unusable judged half costs the comparison nothing it was entitled to.

### `no_regression` is a charter extension

The charter's `ScoreComparison` entity declares `outcome` as `regression` /
`judge-attributable` / `incomparable` / `TRACE_FIXTURE_STALE`, plus `indistinguishable`
at v2. That set has no member for the ordinary case where nothing regressed, yet the
entity is described as "a closed set, so a spec author never has to reconstruct it from
prose". Row 6 needs a value, and reusing `judge-attributable` for "nothing moved" would
make the most common result indistinguishable from judged noise.

`no_regression` is therefore proposed as a sixth member, and the charter's Domain Model
needs a revision to carry it. This spec does not assume the revision has happened; the
task map carries it as work.

## Interface

New module pair, following the shape `rubric.mjs` / `rubric-schema.mjs` and
`score.mjs` / `score-schema.mjs` already established — the schema module holds frozen
constants and no I/O, and the executable module consumes them without restating the
contract.

| Interface | Type | Description |
|---|---|---|
| `recordBaseline(rubricId, runRecord, score, opts)` | function | Write a baseline. `opts.recordedAt` is required; `opts.promote` permits overwrite |
| `loadBaseline(rubricId)` | function | Read a baseline, throwing named errors on a missing or malformed file |
| `compareScores(baseline, candidate)` | function | Produce a ScoreComparison |
| `adev eval baseline record --rubric <id> [--promote]` | CLI verb | Wraps `recordBaseline` |
| `adev eval baseline show --rubric <id> [--json]` | CLI verb | Wraps `loadBaseline` |
| `adev eval compare --rubric <id> --candidate <path> [--json]` | CLI verb | Wraps `compareScores` |

### Two naming hazards, both load-bearing

**`compareScores`, not `compareToBaseline`.** `lib/evals/read-trace.mjs` already exports
`compareToBaseline(observed, baseline)` — it compares an observed *read trace* against a
*trace* baseline. This capability compares a *score* against a *score* baseline. Two
functions in one directory, both plausibly named `compareToBaseline`, taking different
argument types and returning different shapes, is a collision waiting to be imported
wrongly. The score-side function is named `compareScores`.

**Score baselines do not live beside trace baselines.** `tests/evals/skill-disclosure/
baselines/*.json` are trace fixtures — committed test data. Score baselines are project
state that changes as the project's quality changes, and they belong in
`.context-index/evals/baselines/`. The word "baseline" means two different things in
this charter, and putting them in one directory would guarantee the two get confused by
someone reading a path rather than a spec.

## Acceptance Criteria

**Storage and provenance**

- [ ] `recordBaseline` writes all six Baseline fields, and a round trip through `loadBaseline` returns them unchanged.
- [ ] `recordBaseline` raises `BASELINE_EXISTS` and writes nothing when a baseline exists and `promote` was not passed; with `promote: true` it overwrites.
- [ ] A baseline path outside the project root raises `UNSAFE_BASELINE_PATH`, following the `UNSAFE_RUBRIC_PATH` precedent.
- [ ] Every stored baseline names its `model_id` and `plugin_version`.

**The outcome procedure**

- [ ] Each of the six rows in the decision table is covered by a test whose inputs match only that row, and each asserts the named outcome.
- [ ] A differing `plugin_version` alone does **not** produce `incomparable` — proven by a test, since this is the case most likely to be "fixed" into a bug by a later reader.
- [ ] Deterministic regression plus judged improvement returns `regression`, not `judge-attributable`.
- [ ] Deterministic identity plus judged improvement returns `judge-attributable`, not `no_regression` — judged movement is judged movement in both directions.
- [ ] A `NOT_SCORED` deterministic half on either side returns `incomparable`; an `INSUFFICIENT_EVIDENCE` judged half does not, and yields `judged_delta: null`.

**Reporting**

- [ ] Every result carries `deterministic_delta` and `judged_delta` as separate fields, and both sides' verdict tables.
- [ ] Deltas are percentages of the baseline side's attainable maximum. A rubric that gains elements between runs, with every verdict otherwise unchanged, produces a delta of `0` — proven by a test, since an absolute-difference implementation passes every other criterion here.
- [ ] A half whose value is a status reports `null`, and no test anywhere asserts `0` for an unscored half.
- [ ] No result carries a spread, variance, or `indistinguishable` field while sampling is deferred.
- [ ] A finding not selected as the outcome still appears in `findings` — proven by a case with both a model mismatch and a stale trace fixture, asserting `incomparable` plus a staleness entry.

**Determinism**

- [ ] `compareScores` called twice on the same inputs returns deep-equal results.
- [ ] No module under `lib/evals/baseline*.mjs` references `Date.now`, `new Date`, or `Math.random` — asserted by a source-level test, not only by behaviour, since a clock read inside a rarely-taken branch would pass every behavioural test above.

**Gates**

- [ ] `npm test` passes.
- [ ] The charter's Domain Model carries `no_regression`, and its Interface Contracts carry the three functions and three verbs.
- [ ] No constitutional violations introduced.

## Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| Baseline file absent for the requested rubric id | Throw, naming the rubric id and the path searched | `BASELINE_NOT_FOUND` |
| Baseline file readable but not valid JSON | Throw, distinct from the missing-file case | `BASELINE_PARSE_ERROR` |
| Baseline missing a required field | Throw, naming the field | `BASELINE_INCOMPLETE` |
| `recordBaseline` would overwrite without `promote` | Throw, write nothing | `BASELINE_EXISTS` |
| `recordBaseline` called without `recordedAt` | Throw — the library must not substitute a clock read | `BASELINE_NO_TIMESTAMP` |
| Baseline path escapes the project root | Throw, reporting the offending path verbatim | `UNSAFE_BASELINE_PATH` |
| Two sides scored against different `rubric_id` values | Throw — a precondition failure, not an `incomparable` verdict | `BASELINE_RUBRIC_MISMATCH` |
| Two sides scored against the same `rubric_id` at different `version` values | Throw, naming both versions | `BASELINE_VERSION_MISMATCH` |
| `compareScores` given a non-object, or a side missing its score half | Throw | `COMPARE_INVALID_INPUT` |

`BASELINE_RUBRIC_MISMATCH` and `BASELINE_VERSION_MISMATCH` throw rather than returning
`incomparable` on purpose. `incomparable` describes two legitimate runs that cannot be
compared for a reason the caller could not have known — a model changed underneath them.
Comparing two different rubrics, or two versions of one rubric, is a caller mistake, and
returning a verdict for it would let a broken harness report clean results indefinitely.

## Open Questions

- **This capability cannot ship a useful verdict until `Run-cost record` lands.** A
  Baseline stores a RunRecord, and `collectRunRecord` is unspecified. The comparison
  logic here is written against the RunRecord contract the charter's Domain Model
  already pins, so it can be built and unit-tested against synthetic records — but
  `adev eval baseline record` cannot be pointed at a real run until the collector
  exists. The two should be planned together even though they are separate capabilities.
- **The `pricing_table` half of BEH-3 is stricter than it needs to be.** A changed
  pricing table invalidates the *cost* comparison; it says nothing about whether the
  verdicts are comparable. The charter's invariant nonetheless calls for whole-comparison
  `incomparable`, and this spec follows it rather than quietly narrowing it. If cost and
  quality comparison are later separated, this is the invariant to revisit first.
