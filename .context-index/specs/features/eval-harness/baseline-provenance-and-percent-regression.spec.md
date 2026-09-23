---
partial_schema: spec@1
charter: eval-harness
kind: behavioral
status: review-passed
risk_level: medium
milestone: v1
revision: 3
charter-revision: 6
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

> **Tier vocabulary.** "Tier C" below means the charter's **eval CI tier**,
> not `gates.yaml`'s, `diagnostics.yaml`'s, or `graduated-rigor-tiers.spec.md`'s.

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
- **Charter Invariant** — "A numeric aggregate is never reported without its
  verdict table." (The Observability *quality attribute* is a different clause;
  this sentence is an invariant.) A comparison result carries both sides' verdict
  tables, not only the deltas.
- **Charter Quality Attribute, "Security"** — Baseline paths are validated against
  traversal, following the `UNSAFE_RUBRIC_PATH` (`lib/evals/rubric.mjs:118`) and
  `UNSAFE_SCORE_PATH` (`lib/evals/score-schema.mjs:71`) precedent. The charter's
  current text names these eval-local codes; at revision 4 it named only
  `UNSAFE_TEMPLATE_PATH`, which lives in a different module.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| `baseline-schema.mjs` | Frozen constants: outcome enum, required Baseline fields, error codes. Data only, no I/O — the established schema-module shape | small |
| `recordBaseline` / `loadBaseline` | Write and read a baseline with path containment and injected `recorded_at`; refuse silent overwrite | medium |
| `compareScores` | The outcome decision procedure, the two-half delta split, and percent normalisation | large |
| Provenance gate | `incomparable` on differing `model_id` or `pricing_table` | small |
| Trace-staleness pass-through | `TRACE_FIXTURE_STALE` surfaced from the disclosure-fidelity check when present | small |
| `adev eval baseline` / `adev eval compare` | CLI verbs wrapping the three functions, `--json` output | medium |
| ~~Charter revision~~ | Done ahead of this spec as a governance edit — charter is at revision 6 | — |
| `buildScoredRun` + ScoredRun validation | The composite `compareScores` and `recordBaseline` take, assembled from rubric + score + RunRecord + trace drift | medium |
| CLI subverb registration | The `switch (sub)` in `lib/cli/eval.mjs`, its `help()` banner, and `docs/cli-reference.md`; no `VERB_REGISTRY` entry is needed since `eval` is already registered | small |

## Visual Expectations

Not applicable — no UI surface. The CLI verbs print a verdict table, the two
deltas, **and the `findings` list**; `--json` emits the ScoreComparison object
verbatim. `findings` is in the default rendering deliberately: the postcondition
below promises that one round trip surfaces every problem, and a finding written
but never shown would defeat that for everyone not passing `--json`.

## The ScoredRun — what a comparison actually takes

`compareScores` does **not** take two `scoreRubric` results. `lib/evals/score.mjs`
returns exactly `{verdicts, deterministic, judged, total}` — no `rubric_id`, no
`version`, no `model_id`, no `pricing_table`, no `run_record` — and
`adev eval score --json` prints that object verbatim. A comparison that read
provenance off a score would have no constructible argument.

This spec therefore owns a small composite, the **ScoredRun**, and the function
that assembles it:

| Field | Source |
|---|---|
| `rubric_id`, `rubric_version` | the loaded rubric (`loadRubric`) |
| `score` | `scoreRubric(rubric, verdicts)` verbatim |
| `run_record` | `collectRunRecord(sessionPath)`. Validated as an **allow-list** against the charter's pinned RunRecord field set, refusing unknown keys, so a later collector change cannot silently widen what a committed artifact carries |
| `trace_drift` | the disclosure-fidelity check's result, or `null`. Shape `{fixture: string, drifted_pointers: string[]}` — the two fields BEH-12's message reads. **Candidate side only**; a stored Baseline carries none |

`buildScoredRun({ rubric, score, runRecord, traceDrift })` returns one. It is
pure assembly with no I/O, it validates every field against the shapes below,
and it is what `recordBaseline` accepts.

**The two sides of a comparison are not the same type**, and the signature says
so: `compareScores(baseline: Baseline, candidate: ScoredRun)`. A stored Baseline
is a ScoredRun minus `trace_drift` (a property of a *run*, not of a stored
record) plus `recorded_at`, `model_id` and `plugin_version`. Requiring both sides
to be ScoredRuns would make `compareScores` reject the very artifact
`loadBaseline` returns — the record → load → compare round trip would not close.
Decision row 3 therefore reads `trace_drift` from the **candidate** only; a
baseline carries none. `scoreRubric`'s return shape is not extended — the composite wraps it,
so the scoring engine's contract is untouched.

`trace_drift` is what makes decision row 3 reachable. The earlier draft had
`TRACE_FIXTURE_STALE` "passing through … when present" into a two-argument
signature with nowhere for it to arrive, so the row was unreachable and the
criterion requiring every row to be covered by a test was unsatisfiable. It now
arrives as a named field, supplied by the disclosure-fidelity capability and
`null` until that capability ships — in which case row 3 never fires, which is
correct rather than merely convenient.

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

- **BEH-1** — **When** `recordBaseline(scoredRun, { recordedAt, projectRoot })` is called for a rubric with no stored baseline **then** a baseline is written to `<projectRoot>/.context-index/evals/baselines/<rubric_id>.json` carrying `rubric_id`, **`rubric_version`**, `run_record`, `score`, `recorded_at`, `model_id`, and `plugin_version`. The top-level `model_id` / `plugin_version` are copied from `scoredRun.run_record` and exist as a display convenience for `adev eval baseline show`; **`compareScores` reads all three provenance fields from `run_record` on both sides**, never the top-level copies — a candidate ScoredRun has no top-level pair, and a hand-edited baseline could diverge. `rubric_version` is stored rather than re-derived: without it a loaded baseline has no version to compare, `BASELINE_VERSION_MISMATCH` can never fire, and the precondition it enforces is unverifiable after a round trip. The write is temp-file-plus-`renameSync` to `<contained-dest>.tmp` — derived from the already-contained destination, never from caller input, so the rename stays within one filesystem and the temp file cannot land outside `baselines/`. The name is deterministic because BEH-10 forbids randomness, and `.context-index/evals/baselines/*.tmp` is gitignored — mirroring the existing `.context-index/tasks/tasks.json.*.tmp` entry — so an interrupted write cannot be committed as project state. The file is opened with `{flag: 'wx'}`: a concurrent second writer fails loudly rather than renaming a half-written file over a good baseline.
- **BEH-14** — **When** a `rubric_id` is resolved into a baseline path **then** it is first refused unless it matches `^[a-z][a-z0-9-]*$`, and the joined path is then contained under `projectRoot` with `resolveContained` / `lenientRealpath` / `isContained` — pattern *before* `join`, containment *after*, following `lib/extensions/exec-payload.mjs::payloadDir`. The base is realpathed **first** (`rootReal = lenientRealpath(resolve(projectRoot))`) and the candidate compared as `isContained(lenientRealpath(abs), rootReal)`, the sequence `lib/evals/rubric.mjs` uses: `resolveContained` does a raw `startsWith` and does not realpath, so comparing a real path against an unrealpathed root rejects every contained path on macOS, where `/var` resolves to `/private/var`. `lenientRealpath` rather than `realpathSync` because `recordBaseline`'s destination legitimately does not exist yet. `rubric_id` is untrusted input: it is read out of a rubric document that may be caller-pointed or plugin-shipped, and the schema constrains neither its charset nor its shape.
- **BEH-2** — **When** `recordBaseline` is called for a rubric id that already has a stored baseline **and** `promote: true` was not passed **then** it raises `BASELINE_EXISTS` and writes nothing. Promotion is a curated step, mirroring the charter's rule that a fresh Tier C capture never auto-replaces a committed trace fixture: a run that already carries the regression would otherwise install it as the new expectation.
- **BEH-3** — **When** `compareScores(baseline, candidate)` is given two sides whose `model_id` differs, or whose `pricing_table` differs **then** it returns `outcome: "incomparable"` naming which field diverged, and reports no deltas. A differing `plugin_version` does **not** trigger this — comparing across plugin versions is the entire purpose.
- **BEH-4** — **When** `compareScores` is given comparable sides **then** the result carries `deterministic_delta` and `judged_delta` as separate fields, always, whatever the outcome. Neither is ever summed into the other.
- **BEH-5** — **When** the candidate's deterministic half scores below the baseline's **then** the outcome is `regression`, regardless of which way the judged half moved.
- **BEH-6** — **When** the deterministic halves are identical **and** the judged half moved in either direction **then** the outcome is `judge-attributable`, never `regression`. Decidable from one run per side; no sampling required.
- **BEH-7** — **When** neither half moved negatively **then** the outcome is `no-regression`. The deltas carry direction and magnitude, so an improvement needs no separate outcome value.
- **BEH-8** — **When** a delta is computed **then** it is expressed as a percentage of that half's **attainable maximum** on the baseline side, not as an absolute point difference — so a rubric that grows or shrinks its element count does not read as a quality change.
- **BEH-9** — **When** either side's half is `NOT_SCORED` or `INSUFFICIENT_EVIDENCE` rather than a number **then** that half's delta is reported as `null`, never as `0`. A half that was not scored has not held steady; conflating the two is how an unscored run reports as healthy.
- **BEH-15** — **When** either side's `score` half fails the shape `lib/evals/score.mjs` emits **then** `BASELINE_SCORE_HALF_MALFORMED` is raised **before any arithmetic**. Each half is an object, always; the shape is: `status` is one of `null` or `"NOT_SCORED"` on the **deterministic** half and one of `null`, `"NOT_SCORED"` or `"INSUFFICIENT_EVIDENCE"` on the **judged** half — `lib/evals/score.mjs::resolveHalfStatus` returns `INSUFFICIENT_EVIDENCE` only for a criterion, so admitting it on the deterministic half would let a hand-edited baseline slip past row 2 (which gates on `NOT_SCORED`) and land on row 6 as `no-regression`; when `status` is `null`, `points` is a finite non-negative number and `max` a finite number greater than zero — deliberately **stricter** than what `scoreRubric` can emit, since a rubric declaring `required_element_points: 0` produces `{points: 0, max: 0}` and BEH-8 divides by that maximum, so a zero denominator has no percent to report; when `status` is non-null, `points` and `max` are both exactly `null`. Anything else is refused.
  Three things about this are deliberate. It is stated **per field**, because a half is never "a number or a status" — naming the union that way describes a shape the engine does not emit and leaves `points` and `max`, which actually carry the `NaN`, unmentioned. It is scoped to the `status === null` branch, because `max: null` is the **legal** value accompanying every status half, and an unconditional finite-`max` requirement would throw on well-formed input and make decision row 2 unreachable. And it applies to **both sides**: `--candidate` reads caller-supplied JSON just as `loadBaseline` reads a hand-editable file, so guarding only the stored side leaves the identical `NaN` fall-through open — `NaN` compares false to everything, so it fails rows 4 and 5 and lands on row 6 as `no-regression`.
  The check lives in `buildScoredRun` and in `loadBaseline`, so nothing malformed reaches `compareScores` from either direction.
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
| 1 | `run_record.model_id` or `run_record.pricing_table` differs between sides | `incomparable` |
| 2 | Either side's deterministic half is `NOT_SCORED` | `incomparable` |
| 3 | The disclosure-fidelity check reports a drifted pointer set | `TRACE_FIXTURE_STALE` |
| 4 | `deterministic_delta < 0` | `regression` |
| 5 | `deterministic_delta == 0` **and** `judged_delta` is a number **and** `judged_delta != 0` | `judge-attributable` |
| 6 | otherwise | `no-regression` |

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

A judged half that is `INSUFFICIENT_EVIDENCE` **or `NOT_SCORED`** is not grounds
for `incomparable`: `judged_delta` reports `null` per BEH-9 and rows 4–6 proceed
on the deterministic half alone. The deterministic half is the only one that can
produce `regression` anyway, so an unusable judged half costs the comparison
nothing it was entitled to.

Row 5's "is a number" clause is load-bearing and is not decoration. `null != 0`
evaluates to **true** in JavaScript, so a row phrased as `judged_delta != 0`
fires `judge-attributable` for a rubric that declares no `quality_dimensions` at
all — claiming judged movement that could not have occurred, which is the same
conflation row 2 rejects for the deterministic half. `lib/evals/score.mjs`
documents the judged half as `{status: null} | {status: "INSUFFICIENT_EVIDENCE"} |
{status: "NOT_SCORED"}`, so all three reach this table.

### `no-regression` was added to the charter at revision 5

At revision 4 the charter's `ScoreComparison` entity declared `outcome` as
`regression` / `judge-attributable` / `incomparable` / `TRACE_FIXTURE_STALE`,
plus `indistinguishable` at v2 — a set with no member for the ordinary case
where nothing regressed, despite being described as "a closed set, so a spec
author never has to reconstruct it from prose". Row 6 needs a value, and reusing
`judge-attributable` for "nothing moved" would make the most common result
indistinguishable from judged noise.

The charter now carries `no-regression` as a sixth member, added in **revision 6**, together with the
ScoredRun-based signatures and the `findings` / verdict-table attributes in
**revision 6**, together with this capability's three functions and three CLI verbs, which
its Interface Contracts table also lacked. That was done as a charter edit
rather than as an implementation task, for two reasons: editing an approved
charter is a governance action rather than something `/adev:plan` decomposes
with TDD expectations, and leaving it in the task map would have stamped
`charter-revision: 4` against a charter at 5 the moment the task landed —
self-inflicting the `CHARTER_STALE` flag `/adev:hygiene` raises — and the
equivalent condition `/adev:status` reports under its own "charter-revision
stale" wording, since only hygiene emits the literal code, with nothing in the spec planning to clear it. The kebab-case spelling
matches `judge-attributable` rather than adding a third casing style to one
enum.

## Interface

New module pair, following the shape `rubric.mjs` / `rubric-schema.mjs` and
`score.mjs` / `score-schema.mjs` already established — the schema module holds frozen
constants and no I/O, and the executable module consumes them without restating the
contract.

| Interface | Type | Description |
|---|---|---|
| `buildScoredRun({rubric, score, runRecord, traceDrift})` | function | Assemble the composite both other functions take. Pure; no I/O |
| `recordBaseline(scoredRun, opts)` | function | Write a baseline. `opts.recordedAt` and `opts.projectRoot` are required; `opts.promote` permits overwrite |
| `loadBaseline(rubricId, opts)` | function | Read a baseline. `opts.projectRoot` is required — the containment base is never an implicit `process.cwd()` |
| `compareScores(baseline, candidate)` | function | Produce a ScoreComparison |
| `adev eval baseline record --rubric <path> --score <path> --run-record <path> --recorded-at <iso8601> [--trace-drift <path>] [--promote]` | CLI verb | Reads the rubric, the `adev eval score --json` output, and the RunRecord from files; assembles a ScoredRun; wraps `recordBaseline`. Every argument the library requires has a flag that supplies it |
| `adev eval baseline show --rubric-id <id> [--json]` | CLI verb | Wraps `loadBaseline`, printing `rubric_id`, `rubric_version`, `recorded_at`, `model_id`, `plugin_version`, and the score halves — so `recorded_at` has a stated reader rather than being written and never surfaced |
| `adev eval compare --rubric <path> --candidate <path> --run-record <path> [--trace-drift <path>] [--json]` | CLI verb | Assembles the candidate ScoredRun the same way, loads the stored baseline, wraps `compareScores`. Exit codes: `0` for `no-regression` / `judge-attributable`, `2` for `regression`, `3` for `incomparable` / `TRACE_FIXTURE_STALE`. **`1` is reserved for a fault** — `BASELINE_NOT_FOUND`, `BASELINE_PARSE_ERROR`, `SCORED_RUN_INVALID`, `BASELINE_SCORE_HALF_MALFORMED` — matching the repo default (`process.exit(1)` for fatal errors, per the constitution and `lib/cli/route.mjs`, `blockers.mjs`, `partial.mjs`). Verdicts must not overlap the fault code: a gate that read a crash as `regression` is the broken-harness-reports-a-verdict failure this spec exists to prevent |

### Two naming hazards, both load-bearing

**`compareScores`, not `compareToBaseline`.** A module `lib/evals/read-trace.mjs`
exporting `compareToBaseline(observed, baseline)` — comparing an observed *read
trace* against a *trace* baseline — is **pending, not present**: it lives on the
unmerged branch `chore/skills/progressive-disclosure` (commit `8368d8b6`) and
does not exist at `HEAD`, where `lib/evals/` holds four files. The charter's
Interface Contracts table was updated at revision 5 to name the implementation's
actual exports (`snapshot` / `since` / `compareToBaseline`) in place of the
aspirational `snapshotReadTrace` / `readTraceSince` / `compareReadTrace` spelling
that was never implemented.

The naming decision stands either way, and does not depend on that branch
landing: a `compareScores` that compares scores and a `compareToBaseline` that
compares traces, sharing one directory, would be a collision waiting to be
imported wrongly. Naming the score-side function `compareScores` costs nothing
now and prevents it later.

**Score baselines do not live beside trace baselines.** Trace fixtures —
`tests/evals/skill-disclosure/baselines/*.json`, also pending on the branch above
— are committed test data. Score baselines are project state that changes as the
project's quality changes, and they belong in `.context-index/evals/baselines/`,
consistent with ADR-0016 clause 1, which makes `.context-index/` the single
system of record for adev state. They are **committed**, not ignored:
`.context-index/evals/` carries no `.gitignore` entry and already holds a tracked
file, and a baseline nobody can review in a diff is a baseline nobody can trust
when it moves. That choice has a cost, which is why `run_record` is allow-listed
rather than serialised verbatim. The word
"baseline" means two different things in this charter, and putting them in one
directory would guarantee the two get confused by someone reading a path rather
than a spec. Note that the charter's Naming attribute fixes
`tests/evals/skill-regression/` as the home for *this charter's own fixtures* —
it is not a claim over every eval directory the charter reads.

## Acceptance Criteria

**Storage and provenance**

- [ ] `recordBaseline` writes all seven Baseline fields, and a round trip through `loadBaseline` returns them unchanged.
- [ ] `recordBaseline` raises `BASELINE_EXISTS` and writes nothing when a baseline exists and `promote` was not passed; with `promote: true` it overwrites.
- [ ] A baseline path outside the project root raises `UNSAFE_BASELINE_PATH`, following the `UNSAFE_RUBRIC_PATH` precedent.
- [ ] A traversal-bearing `rubric_id` is refused with `BASELINE_INVALID_RUBRIC_ID` **before** any `join`, and a symlink escape — both a linked `baselines/` directory and a linked `<id>.json` — is refused after it, extending the single symlinked-**file** case `tests/lib/evals/rubric-path-containment.test.mjs` covers with the symlinked-**directory** shape it does not.
- [ ] Both functions throw `BASELINE_NO_PROJECT_ROOT` when `projectRoot` is absent; no test relies on `process.cwd()`.
- [ ] An interrupted `--promote` leaves the prior baseline intact (temp-file-plus-rename), proven by asserting the prior content survives a failed write.
- [ ] Every stored baseline names its `model_id` and `plugin_version`.

**The outcome procedure**

- [ ] Each of the six rows in the decision table is covered by a test whose inputs match only that row, and each asserts the named outcome — **including row 3**, whose input is now constructible because `trace_drift` is a named ScoredRun field rather than an unrouted pass-through.
- [ ] `scoreRubric`'s return shape is unchanged — asserted by a test that its output carries no `rubric_id`.
- [ ] `buildScoredRun` is the only path by which `recordBaseline` receives a ScoredRun — asserted separately, since the clause above does not cover it.
- [ ] `SCORED_RUN_INVALID` is exercised by a missing-field input.
- [ ] `BASELINE_VERSION_MISMATCH` throws when a stored baseline's `rubric_version` differs from the candidate's — reachable only because `rubric_version` is now persisted.
- [ ] `adev eval baseline show` prints `recorded_at`.
- [ ] A differing `plugin_version` alone does **not** produce `incomparable` — proven by a test, since this is the case most likely to be "fixed" into a bug by a later reader.
- [ ] Deterministic regression plus judged improvement returns `regression`, not `judge-attributable`.
- [ ] Deterministic identity plus judged improvement returns `judge-attributable`, not `no-regression` — judged movement is judged movement in both directions.
- [ ] A `NOT_SCORED` deterministic half on either side returns `incomparable`.
- [ ] A rubric declaring **no `quality_dimensions`** — judged half `NOT_SCORED`, `judged_delta: null`, deterministic halves identical — returns `no-regression`, **not** `judge-attributable`. This is the `null != 0` case; a row-5 implementation omitting the is-a-number clause passes every other criterion here and fails only this one.
- [ ] An `INSUFFICIENT_EVIDENCE` judged half likewise yields `judged_delta: null` and does not produce `incomparable`.
- [ ] A **baseline** whose `status: null` half carries `max: 0`, a negative `max`, or a numeric-string `points` raises `BASELINE_SCORE_HALF_MALFORMED` rather than yielding `no-regression`.
- [ ] A **candidate** with the same corruption raises it too — proven separately, since a guard on the load path alone passes every other criterion here.
- [ ] A well-formed `NOT_SCORED` half (`points: null`, `max: null`) is **accepted** — proven explicitly, since an unconditional finite-`max` check passes the two criteria above while making decision row 2 unreachable.

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
- [ ] The charter (revision 6) carries `no-regression` in the `ScoreComparison` enum, its `findings` / `baseline_verdicts` / `candidate_verdicts` attributes, `rubric_version` on the Baseline entity, the ScoredRun entity, and all four functions at the signatures this spec declares, with the three verbs named in Interface Contracts (the charter declares no CLI flag signatures to compare against) — and this spec stamps `charter-revision: 6`, so `/adev:hygiene` raises no `CHARTER_STALE`.
- [ ] `adev eval baseline record`, `adev eval baseline show`, and `adev eval compare` each appear in `docs/cli-reference.md`'s `eval` section, asserted by a test — `tests/docs/reference-section.test.mjs` derives its expectations from `VERB_REGISTRY` top-level verbs only, so it cannot catch an undocumented subverb.
- [ ] `adev eval compare` exits `0` / `2` / `3` per the outcome mapping, and `1` for a fault (`BASELINE_NOT_FOUND`, `BASELINE_SCORE_HALF_MALFORMED`) — asserted end-to-end including the fault path, so no crash reads to a gate as a verdict.
- [ ] No constitutional violations introduced.

## Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| Baseline file absent for the requested rubric id | Throw, naming the rubric id and the path searched | `BASELINE_NOT_FOUND` |
| Baseline file readable but not valid JSON | Throw, distinct from the missing-file case | `BASELINE_PARSE_ERROR` |
| Baseline missing a required field | Throw, naming the field | `BASELINE_INCOMPLETE` |
| `recordBaseline` would overwrite without `promote` | Throw, write nothing | `BASELINE_EXISTS` |
| `recordBaseline` called without `recordedAt` | Throw — the library must not substitute a clock read | `BASELINE_NO_TIMESTAMP` |
| `recordBaseline` or `loadBaseline` called without `projectRoot` | Throw — the containment base is never an implicit `process.cwd()` | `BASELINE_NO_PROJECT_ROOT` |
| `rubric_id` fails `^[a-z][a-z0-9-]*$` | Throw before any `join` | `BASELINE_INVALID_RUBRIC_ID` |
| Either side's score half fails the shape `lib/evals/score.mjs` emits | Throw before any arithmetic | `BASELINE_SCORE_HALF_MALFORMED` |
| `buildScoredRun` given a missing or malformed field | Throw | `SCORED_RUN_INVALID` |
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
  ScoredRun carries a RunRecord, and `collectRunRecord` is unspecified. The
  library half is genuinely buildable and unit-testable against synthetic
  records — the charter's Domain Model pins every RunRecord field `compareScores`
  reads — and `buildScoredRun` now gives the CLI somewhere to put one, so the
  verb signature is no longer the blocker it was. The comparison
  logic here is written against the RunRecord contract the charter's Domain Model
  already pins, so it can be built and unit-tested against synthetic records — but
  `adev eval baseline record` cannot be pointed at a real run until the collector
  exists. The two should be planned together even though they are separate capabilities.
- **The `pricing_table` half of BEH-3 is stricter than it needs to be.** A changed
  pricing table invalidates the *cost* comparison; it says nothing about whether the
  verdicts are comparable. The charter's invariant nonetheless calls for whole-comparison
  `incomparable`, and this spec follows it rather than quietly narrowing it. If cost and
  quality comparison are later separated, this is the invariant to revisit first.
