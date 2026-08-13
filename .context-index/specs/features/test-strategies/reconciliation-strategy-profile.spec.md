---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-pending
risk_level: high
milestone:
revision: 3
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
> Attribute on extensibility. The authoritative **shared 9 → 12 update surface**
> — every registry, test, doc, and sibling-spec site that must change in the same
> commit — is the table in `snapshot-strategy-profile.spec.md`'s charter extension
> note. It is maintained in one place rather than triplicated. Earlier drafts of
> all three profile specs undercounted it (three count-assertion sites, not two;
> ID *arrays* and describe titles as well as `assert.equal` lines) and wrongly
> listed `cross-strategy-gaming-patterns.spec.md`, which already reads "any
> registered strategy type".

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

**6. Detection heuristics and pattern-level exclusions**

`detectTaskStrategy` evaluates a **fixed linear rule list** and returns the first
match. `reconciliation` is appended after the shipped cascade and is the **first
of the three new rules** — the canonical order `reconciliation` → `tolerance` →
`snapshot` is set once in `snapshot-strategy-profile.spec.md`'s charter extension
note. It requests no reordering or modification of any shipped rule. Being first
among the new rules is what makes `reconciliation/__snapshots__/x.snap` resolve
to `reconciliation` rather than `snapshot`.

| Pattern | Confidence |
|---|---|
| `reconciliation/**`, `recon/**` | high |
| `parity/**`, `*.reconciliation.{sql,py,yaml,yml,json}` | high |
| `migration/**` combined with `compare` or `parity` in the filename | medium |

Because `reconciliation` is last, every earlier rule wins by construction:

- **`schema` wins** for anything under `migrations/` — a migration file is a
  migration task even when it mentions parity. This is the intended outcome.
- **`fixture` wins for `models/**/*.sql`**, including
  `models/reconciliation/x.sql`. Reconciliation work inside a dbt `models/` tree
  must be declared via the manifest `test_strategies` block or spec frontmatter
  rather than auto-detected. This is a deliberate accepted limitation, replacing
  an earlier draft's unimplementable claim that `reconciliation` is "checked
  before `fixture`".

**6a. Multi-path resolution**

`detectTaskStrategy` iterates a task's **file paths in the outer loop** and rules
in the inner loop, so the first *path* that matches any rule decides — precedence
applies within a single path, never globally. For
`["models/x.sql", "reconciliation/y.sql"]` the first path wins and the task
resolves to `fixture`. Mixed-path tasks must declare their strategy explicitly.

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
verification records `deferred` with `reason_code: infra_partial`, naming the
unreachable system and the unmet `infra_requirements` entry. When **neither**
system is reachable it records `deferred` with `reason_code: infra_unavailable`
— stated explicitly here for symmetry, since both cases are `deferred` and only
the reason code distinguishes them. A reconciliation that can read only one side
has no verdict to give; recording anything other than `deferred` is the exact
failure mode this profile exists to prevent.

**9. Handoff format**

The handoff block carries: source system identifier and read command, target
system identifier and read command, declared grain, leg definitions, the closed
classification set, the declared minimum population size, watermark/point-in-time
rule, the report artifact path, and the pass rule.

**9a. Credential rule for recorded commands**

Read commands are recorded literally, but a command embedding a **credential
value** literally is rejected. Credentials are referenced **only** by named
environment variable (`$VAR` / `${VAR}`), matching the constraint the
`infra_requirements` `probe` field already imposes and the spec template's "env
var names only — MUST NOT contain actual credential values" rule. Reconciliation
is the highest-exposure case in this strategy family because it records
credentials for **two** live systems in a committed artifact, so this rule is not
optional. `psql "postgresql://u:pw@h/db" -c …` is rejected with
`RECONCILIATION_CREDENTIAL_IN_COMMAND`; `psql "$RECONCILIATION_SOURCE_URL" -c …` is
accepted. Connection-string variables embed passwords and are treated as secrets,
as `integration-strategy-profile.spec.md` already states.

**9b. Remaining required profile fields**

`getStrategyProfile('reconciliation')` must return all 8 contract fields without
falling back to `unit`. Two do not follow from the behaviors above:

- **`seed_data_rule`:** *"Neither side is seeded. The rule is a read rule: both
  populations must be read at the declared watermark or point-in-time, through
  independent paths, covering the full declared grain, with the compared
  population size recorded per side and asserted against the declared minimum."*
- **`permitted_tools`:** the effective list is resolved from the **project's
  declared read commands** — the manifest `test_strategies` entry for
  `reconciliation` merged with the domain profile via
  `lib/domains/merge-test-config.mjs`. The profile file carries a **non-empty**
  default list (`psql`, `mysql`, `sqlite3`, `bq`, `snowsql`, `duckdb`, `jq`,
  `csvdiff`) because `loadProfile()` treats an empty array as a missing field and
  falls back to `unit`.

### Postconditions

- A reconciliation report exists at the declared grain covering all three legs.
- Every divergence is classified; none is `unexplained`.
- A `VerificationOutcome` is recorded, with `deferred` used for any access gap.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Grain not declared | Block before running | `RECONCILIATION_GRAIN_UNDECLARED` |
| Recorded read command embeds a literal credential value | Block | `RECONCILIATION_CREDENTIAL_IN_COMMAND` |
| Fewer than the three mandatory legs run | Block | `RECONCILIATION_INCOMPLETE_LEGS` |
| Either population is empty or below the declared minimum | Block | `RECONCILIATION_EMPTY_POPULATION` |
| A divergence is unclassified or classified `unexplained` | Fail (a real finding) | `RECONCILIATION_UNEXPLAINED_DRIFT` |
| Classification set not declared, or a catch-all class used without a cause | Block | `RECONCILIATION_CLASSIFIER_UNDECLARED` |
| Target read reuses the writer's query or view | Block | `RECONCILIATION_ONE_SIDED_READ` |
| Only one system reachable | Record `deferred` | `RECONCILIATION_DEFERRED_PARTIAL_ACCESS` |
| Neither system reachable | Record `deferred` | `RECONCILIATION_DEFERRED_INFRA` |
| Sampled comparison reported as full-population | Block | `RECONCILIATION_SAMPLING_UNDISCLOSED` |

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
| `lib/test-strategies/registry.mjs` | High | Add the `reconciliation` entry; **every site in the shared 9 → 12 table** (see `snapshot-strategy-profile.spec.md`) updates in the same change — including ID *arrays* and describe titles, not only `assert.equal(…, 9)` lines |
| `lib/test-strategies/profiles/reconciliation.md` | High | New profile with all 8 required contract fields, including the `seed_data_rule` and non-empty `permitted_tools` defined in Behavior 9b |
| `lib/test-strategies/detection.mjs` | Medium | **Append** the cascade rule per Behavior 6 at the end of the rule list. No shipped rule is reordered or modified |
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

- [ ] `getStrategyProfile('reconciliation')` loads without falling back to `unit`, with a non-empty `permitted_tools` default and the `seed_data_rule` from Behavior 9b
- [ ] Profile contains all 8 required contract fields and passes the profile-contract sweep at `tests/evals/test-strategies/test-strategies.test.mjs:740`
- [ ] A read command containing a literal credential blocks with `RECONCILIATION_CREDENTIAL_IN_COMMAND`; the `$VAR` form is accepted
- [ ] Error codes use the full `RECONCILIATION_` strategy-id prefix, matching `SNAPSHOT_`/`TOLERANCE_`/`THRESHOLD_` convention
- [ ] A reconciliation with only a count leg blocks with `RECONCILIATION_INCOMPLETE_LEGS`
- [ ] A reconciliation over an empty population blocks with `RECONCILIATION_EMPTY_POPULATION`
- [ ] An unclassified divergence fails; a `catch-all` class without a cause blocks
- [ ] Comparing global aggregates when a grain was declared blocks
- [ ] One-system-reachable records `deferred` with the unreachable system named — never `green`
- [ ] The `reconciliation` rule is **appended** at the end of the cascade; a regression test asserts no shipped rule changed its result
- [ ] Detection returns `schema` for `migrations/parity_check.sql`, `fixture` for `models/reconciliation/x.sql` (the documented accepted limitation), and `reconciliation` for `recon/compare_counts.py`
- [ ] All quality gates pass; no constitutional violations introduced
