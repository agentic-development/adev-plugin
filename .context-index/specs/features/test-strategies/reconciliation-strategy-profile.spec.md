---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-pending
risk_level: high
milestone:
revision: 1
charter-revision: 5
created: 2026-08-13
updated: 2026-08-13
---

# Live Spec: Reconciliation Strategy Profile

**Capability:** Define the `reconciliation` strategy profile — an 11th strategy
type for migration, dual-write, and replatform work, where correctness is proven
by comparing two **independently produced populations** (a source system and a
target system) rather than by comparing code output against an authored
expectation. RED is a reconciliation report showing unexplained divergence;
GREEN is a report where every divergence falls into a declared, classified,
accepted category.

> **Charter extension note:** The test-strategies charter (revision 4) defined 9
> strategies. `reconciliation` is an 11th, justified by the charter Quality
> Attribute on extensibility. Sibling specs to update when this lands:
> - `strategy-type-registry` — "exactly 9 strategy types" → 12; add a registry table row
> - `strategy-profile-contract` — registered-slug set grows; validation stays dynamic via `getStrategy()`
> - `cross-strategy-gaming-patterns` — "any of the 8 types" → "any registered strategy type"
> - `strategy-detection-heuristics` — add the cascade entry defined in Behavior 6

## Problem and Motivation

The 2026-08-10 audit found a data-migration accelerator that wrote roughly 2,557
LOC of row-count, schema, and column-profile reconciliation scripts plus a
13-branch drift classifier — an entire verification discipline that adev had no
name for. The distinguishing property is that **neither side of the comparison is
authored**: both the source population and the target population are produced by
running systems, and the assertion is about their agreement.

This is not `fixture` (which compares a transform against a committed expected
output), not `contract` (which compares a provider against a consumer's declared
expectations), and not `snapshot` (which compares one system against its own
earlier self). Reconciliation compares **two systems at the same point in time**.

## Behavioral Contract

### Preconditions

- The task moves, copies, or dual-writes a population of records between two
  systems, or maintains two systems expected to agree.
- Both source and target are independently readable at verification time, and
  each read is reproducible.
- A strategy assignment of `reconciliation` has been made.
- `infra_requirements:` declares access to **both** systems, so `runPreflight()`
  can report partial access (see Behavior 8).

### Behaviors

**1. RED/GREEN semantics**

- **RED:** The reconciliation report shows divergence between source and target
  that is not covered by a declared, classified exception. RED caused by an
  inability to read either side is **not** valid RED — that is `deferred`.
- **GREEN:** Every observed divergence maps to a declared exception class with a
  stated cause and an accepted disposition, and no divergence is unclassified.
  A reconciliation that reports zero rows compared is never GREEN.

**2. Reconciliation legs are mandatory and plural**

A reconciliation verification must run at least three legs, and each leg reports
independently:

| Leg | Question | Minimum assertion |
|---|---|---|
| Count | Do both sides hold the same number of records? | Exact counts per partition/grain, not a global total only |
| Schema | Do both sides agree on structure? | Column set, types, nullability, and key constraints |
| Profile | Do the values agree? | Per-column aggregates (null rate, distinct count, min/max, checksum of sorted key column) |

A single-leg reconciliation (count only) is explicitly insufficient and is a
gaming blocker (Behavior 5). Projects may add legs (referential integrity,
row-level hash comparison); they may not drop the three.

**3. Grain must be declared**

The comparison grain (the partition or key at which counts and profiles are
compared — e.g. per table, per date partition, per tenant) is declared before the
run. Comparing only a global aggregate hides offsetting errors: a thousand rows
lost in one partition and a thousand gained in another nets to zero. Every leg
reports at the declared grain.

**4. Divergence must be classified, not summarised**

Every non-zero divergence carries a classification with a fixed shape:
`{ leg, grain_key, observed, expected, class, cause, disposition }`, where
`class` is one of a declared, project-owned closed set (for example:
`expected_transform`, `known_source_defect`, `timing_skew`, `out_of_scope_filter`,
`unexplained`). Any divergence classified `unexplained` — or carrying no
classification at all — fails the verification. The classifier's branch set is
part of the spec's declared expectation, so adding a branch is a reviewable
change rather than a silent widening.

**5. Gaming blockers**

- **Count-only reconciliation:** asserting record counts without schema and
  profile legs. Counts match trivially when both sides are empty or when
  compensating errors offset.
- **Global-aggregate comparison:** comparing only totals when a grain was
  declared, masking offsetting divergence.
- **Empty-population pass:** reconciling zero rows against zero rows. Both sides
  must be non-empty, and the compared population size is asserted against a
  declared minimum.
- **Sampling presented as reconciliation:** comparing a sample and reporting a
  full-population verdict. Sampling is permitted only when declared, with the
  sampling method, sample size, and the resulting confidence stated in the
  report; the verdict must be labelled as sampled.
- **Catch-all classification:** an exception class such as `other`,
  `acceptable`, or `known_issue` applied to divergence with no stated cause —
  this converts the classifier into a rubber stamp.
- **Tolerance smuggling:** introducing a numeric tolerance into a reconciliation
  leg without declaring it under the `tolerance` strategy's rules. Exact legs are
  exact; a tolerated leg must state its band and justification (see
  `tolerance-strategy-profile.spec.md`).
- **One-sided read:** reading the target from the same query, view, or export
  that produced it, so the comparison is a system against itself.
- **Post-hoc filter narrowing:** adding `WHERE` clauses or scope exclusions
  between RED and GREEN so that diverging records leave the compared population.

**6. Detection heuristics and cascade position**

| Pattern | Confidence |
|---|---|
| `reconciliation/**`, `recon/**` | high |
| `parity/**`, `*.reconciliation.{sql,py,yaml,yml,json}` | high |
| `migration/**` combined with `compare`/`parity` in the filename | medium |

Cascade precedence, stated explicitly:

- `schema` is checked **before** `reconciliation`: a file under `migrations/` is
  a migration task, even if it mentions parity.
- `reconciliation` is checked **before** `fixture`, so
  `models/reconciliation/*.sql` reconciles rather than fixture-compares.
- `reconciliation` never claims bare `models/**/*.sql`, which stays `fixture`.

**7. Assertion rules**

- Both sides are read through independent paths; the target read must not reuse
  the writer's query, view, or in-memory result.
- Every leg reports at the declared grain, with per-grain-key rows in the report,
  not only a roll-up.
- The report records: population size per side, per-leg verdict, every divergence
  with its classification, the reconciliation timestamp per side, and the
  point-in-time or watermark used to make the two reads comparable.
- Timing skew is handled explicitly: either both sides are read at a declared
  watermark, or skew is a declared exception class with a stated bound.
- The report is the evidence artifact referenced by the `VerificationOutcome`.

**8. Partial access is `deferred`, never `pass`**

When `runPreflight()` finds credentials for one system but not the other, the
verification records `deferred` with `reason_code: infra_partial` naming the
unreachable system and the unmet `infra_requirements` entry. A reconciliation
that can read only one side has no verdict to give — recording anything other
than `deferred` is the exact failure mode this profile exists to prevent.

**9. Handoff format**

The handoff block carries: source system identifier and read command, target
system identifier and read command, declared grain, leg definitions, the closed
classification set, the declared minimum population size, watermark/point-in-time
rule, the report artifact path, and the pass rule.

### Postconditions

- A reconciliation report exists at the declared grain covering all three legs.
- Every divergence is classified; none is `unexplained`.
- A `VerificationOutcome` is recorded, with `deferred` used for any access gap.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Grain not declared | Block before running | `RECON_GRAIN_UNDECLARED` |
| Fewer than the three mandatory legs run | Block | `RECON_INCOMPLETE_LEGS` |
| Either population is empty or below the declared minimum | Block | `RECON_EMPTY_POPULATION` |
| A divergence is unclassified or classified `unexplained` | Fail (a real finding) | `RECON_UNEXPLAINED_DRIFT` |
| Classification set not declared, or a catch-all class used without a cause | Block | `RECON_CLASSIFIER_UNDECLARED` |
| Target read reuses the writer's query or view | Block | `RECON_ONE_SIDED_READ` |
| Only one system reachable | Record `deferred` | `RECON_DEFERRED_PARTIAL_ACCESS` |
| Neither system reachable | Record `deferred` | `RECON_DEFERRED_INFRA` |
| Sampled comparison reported as full-population | Block | `RECON_SAMPLING_UNDISCLOSED` |

## System Constitution Reference

- **"Minimize external dependencies"** — adev ships no database drivers; the
  project supplies read commands. The profile defines the contract, not the
  connectivity.
- **"Skills are primarily markdown"** — the profile is
  `lib/test-strategies/profiles/reconciliation.md`.
- **"No inline Node in SKILL.md"** — reconciliation logic is reached through a
  named CLI verb; skill prose names the verb only.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `lib/test-strategies/registry.mjs` | High | Add the `reconciliation` entry; update both count assertions in the same change |
| `lib/test-strategies/profiles/reconciliation.md` | High | New profile with all 8 required contract fields |
| `lib/test-strategies/detection.mjs` | Medium | Cascade entry per Behavior 6, after `schema`, before `fixture` |
| `lib/test-strategies/gaming.mjs` | Medium | Detectors for count-only legs, empty population, catch-all classification |
| `lib/infra-preflight.mjs` | Medium | Surface *which* declared system failed preflight so `infra_partial` can name it |
| `templates/manifest-template.yaml` | Low | `reconciliation` example in the activated block |
| `skills/write-test/SKILL.md`, `skills/validate/SKILL.md` | **Deferred — out of scope for this spec** | Dispatch and gate prose. Contended surfaces; required follow-up |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Registry entry | Add `reconciliation`; update both count assertions | small |
| Profile markdown | Author `profiles/reconciliation.md` | medium |
| Detection cascade | Entry + collision tests against `schema` and `fixture` | medium |
| Leg/grain contract | Document the three mandatory legs and grain declaration | medium |
| Classification contract | Closed classification set, `unexplained` handling | medium |
| Preflight partial-access reporting | Name the unreachable system in the preflight report | medium |
| Gaming detectors | Count-only, empty population, catch-all class | medium |
| Tests | Profile load, leg enforcement, grain, classification, each error code | large |

## Acceptance Criteria

- [ ] `getStrategyProfile('reconciliation')` loads without falling back to `unit`
- [ ] Profile contains all 8 required contract fields
- [ ] A reconciliation with only a count leg blocks with `RECON_INCOMPLETE_LEGS`
- [ ] A reconciliation over an empty population blocks with `RECON_EMPTY_POPULATION`
- [ ] An unclassified divergence fails; a `catch-all` class without a cause blocks
- [ ] Comparing global aggregates when a grain was declared blocks
- [ ] One-system-reachable records `deferred` with the unreachable system named — never `green`
- [ ] Detection returns `schema` for `migrations/parity_check.sql` and `reconciliation` for `models/reconciliation/x.sql`
- [ ] All quality gates pass; no constitutional violations introduced
