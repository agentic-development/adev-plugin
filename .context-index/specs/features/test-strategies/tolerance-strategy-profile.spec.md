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

# Live Spec: Tolerance Strategy Profile

**Capability:** Define the `tolerance` strategy profile — a 12th strategy type
for data-quality assertions that are correct within a **declared, justified,
non-zero numeric band** rather than exactly. RED is a measured value outside its
declared band; GREEN is every measured value inside its band, with the band
itself having been declared and justified before the measurement.

> **Charter extension note:** The test-strategies charter (revision 4) defined 9
> strategies. `tolerance` is a 12th, justified by the charter Quality Attribute on
> extensibility. Sibling specs to update when this lands:
> - `strategy-type-registry` — "exactly 9 strategy types" → 12; add a registry table row
> - `strategy-profile-contract` — registered-slug set grows; validation stays dynamic
> - `cross-strategy-gaming-patterns` — "any of the 8 types" → "any registered strategy type"
> - `strategy-detection-heuristics` — add the cascade entry defined in Behavior 6
> - `threshold-strategy-profile` — add a scope note: `threshold` remains **performance-only**; data-quality bands are `tolerance`

## Problem and Motivation

The shipped `threshold` strategy is performance-only by construction: its
assertion rules mandate percentile types, latency, error rate, warm-up periods,
and concurrency. It has no vocabulary for "row counts must agree within 0.1%" or
"the null rate in this column may rise by at most 2 points." The 2026-08-10 audit
found a project asserting exactly those things with no adev strategy to hang them
on.

Overloading `threshold` was rejected. Its gaming blockers (*"thresholds set too
loose — p95 >= 5s"*, *"mean-only assertions without percentile targets"*) are
latency-specific and would be meaningless for a data band, while the gaming
patterns that matter for data bands — a band widened after a failing run, a band
with no stated justification — have no analogue in the performance profile.
Two strategies with disjoint gaming rules are two strategies.

## Behavioral Contract

### Preconditions

- The task asserts a numeric property of data (count, rate, ratio, aggregate,
  distribution statistic) where exact equality is not the correct expectation.
- The reason exactness does not apply is statable — floating-point accumulation,
  a known source-system defect, sampling, timing skew, or an accepted rounding
  rule. "It never matched exactly" is not a reason.
- A strategy assignment of `tolerance` has been made.

### Behaviors

**1. RED/GREEN semantics**

- **RED:** At least one measured value falls outside its declared tolerance band.
  RED produced by an *undeclared* band (nothing to compare against) is not valid
  RED — it is `TOLERANCE_BAND_UNDECLARED`.
- **GREEN:** Every measured value falls inside its declared band, every band was
  declared before the measurement that it judges, and the measured population met
  its declared minimum size.

**2. A band is declared, not discovered**

Each asserted metric declares, before the measuring run:
`{ metric, grain, comparison (absolute|relative), band, direction, justification, expiry? }`.
`band` is an explicit numeric value with a unit (e.g. `0.1%` relative, or `±3`
absolute). `direction` states whether the band is two-sided or one-sided (some
divergences are acceptable only in one direction — records may be deduplicated
away but never invented). `justification` is prose naming the mechanism that
makes exactness wrong. A band with no justification is inadmissible.

**3. Zero is the default; a band is an exception that must be argued**

The profile's default expectation is exact equality. Declaring a band is an
explicit, reviewable deviation. This inverts the usual failure mode where a
tolerance is chosen to make the current data pass.

**4. Bands are immutable within a task; widening requires a new record**

A declared band may not be edited after a run has measured against it. A band
that proves wrong is replaced by declaring a **new** band with its own
justification and an explicit record of the superseded value — never by editing
the old number in place. The write-test → implement handoff records the band's
checksum so an in-place edit is detectable.

**5. Gaming blockers**

- **Post-hoc widening:** enlarging a band after a run fell outside it. The
  defining gaming pattern for this strategy.
- **Unjustified band:** a band with no stated mechanism, or a justification that
  restates the number ("0.5% because 0.5% is acceptable").
- **Absorbing band:** a band so wide that no realistic failure could fall
  outside — for example a relative band ≥ 50%, or an absolute band exceeding the
  measured value itself. Such bands are blocked, and any band above a declared
  project ceiling requires explicit human approval.
- **Band with no floor population:** applying a relative band to a tiny
  population, where one record is many percent. A minimum population size must be
  declared alongside any relative band.
- **Direction laundering:** declaring a two-sided band when only one direction is
  actually acceptable, so that a divergence in the forbidden direction passes.
- **Aggregate-only tolerance:** applying the band to a global aggregate when a
  grain was declared, allowing offsetting per-grain errors to cancel.
- **Tolerance on an exactness-required metric:** applying a band to a primary-key
  count, a financial total, or any metric the spec declares exact. The profile
  requires an explicit exact-metrics list that bands may not touch.
- **Expiry evasion:** a band declared as temporary (with `expiry`) that is
  silently carried past its expiry date instead of being re-justified.

**6. Detection heuristics and cascade position**

| Pattern | Confidence |
|---|---|
| `tolerances/**`, `*.tolerance.{yaml,yml,json}` | high |
| `data_quality/**`, `dq/**`, `expectations/**` | medium |

Cascade precedence, stated explicitly:

- `tolerance` **never** claims `k6/**`, `locust/**`, `artillery/**`, or
  `*.bench.*` — those remain `threshold`. Performance bands are `threshold`;
  data bands are `tolerance`. The two never overlap on a path pattern.
- `threshold` is checked **before** `tolerance` in the cascade, so any ambiguity
  resolves to the shipped strategy and existing detection behaviour is unchanged.
- `tolerance` is checked **before** `fixture` only for the patterns above;
  `models/**/*.sql` remains `fixture`.

**7. Assertion rules**

- Every band declaration is machine-readable and lives in a versioned file, not
  in prose.
- Both the measured value and its band appear in the report, with the margin
  (how close the value came to the edge) so a chronically near-edge metric is
  visible before it fails.
- Relative bands require a declared minimum population size; absolute bands
  require a declared unit.
- The spec's exact-metrics list is enforced: a band naming a metric on that list
  is rejected at declaration time, not at run time.
- Bands with `expiry` are checked against the run date; an expired band fails.

**8. Handoff format**

The handoff block carries: the band declaration file path and its SHA-256, each
`{metric, grain, comparison, band, direction, justification, expiry?}` tuple, the
exact-metrics list, the declared minimum population size, the measurement command,
and the report path.

**9. Verification outcome recording**

Each tolerance verification records a `VerificationOutcome`. A measurement that
cannot run for environmental reasons records `deferred` with
`reason_code: infra_unavailable`. A metric whose population fell below its
declared minimum records `deferred` with `reason_code: insufficient_population` —
it is neither a pass nor a data failure, and hiding it as either is the failure
mode this profile guards against.

### Postconditions

- Every asserted metric has a declared, justified, unexpired band.
- Every measured value is inside its band, at the declared grain.
- A `VerificationOutcome` is recorded, with `deferred` for unrunnable or
  under-populated measurements.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A metric is asserted with no declared band | Block | `TOLERANCE_BAND_UNDECLARED` |
| Band declared without a justification | Block | `TOLERANCE_UNJUSTIFIED` |
| Band edited after a run measured against it | Block | `TOLERANCE_BAND_MUTATED` |
| Band exceeds the project ceiling / is absorbing | Block, require human approval | `TOLERANCE_BAND_TOO_WIDE` |
| Relative band with no declared minimum population | Block | `TOLERANCE_NO_POPULATION_FLOOR` |
| Band applied to a metric on the exact-metrics list | Block at declaration time | `TOLERANCE_ON_EXACT_METRIC` |
| Band past its declared expiry | Fail | `TOLERANCE_BAND_EXPIRED` |
| Measured value outside its band | Fail (a real finding) | `TOLERANCE_EXCEEDED` |
| Population below the declared minimum | Record `deferred` | `TOLERANCE_DEFERRED_POPULATION` |
| Measurement cannot run (credentials/connectivity) | Record `deferred` | `TOLERANCE_DEFERRED_INFRA` |

## System Constitution Reference

- **"Minimize external dependencies"** — band parsing and comparison use Node.js
  built-ins; no statistics library is introduced.
- **"Skills are primarily markdown"** — the profile is
  `lib/test-strategies/profiles/tolerance.md`.
- **"No inline Node in SKILL.md"** — band evaluation is reached through a named
  CLI verb.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `lib/test-strategies/registry.mjs` | High | Add the `tolerance` entry; update both count assertions in the same change |
| `lib/test-strategies/profiles/tolerance.md` | High | New profile with all 8 required contract fields |
| `lib/test-strategies/detection.mjs` | Medium | Cascade entry per Behavior 6, strictly after `threshold` |
| `lib/test-strategies/gaming.mjs` | Medium | Detectors for post-hoc widening, unjustified band, absorbing band |
| `threshold-strategy-profile.spec.md` | Low | Scope note: `threshold` stays performance-only |
| `templates/manifest-template.yaml` | Low | `tolerance` example in the activated block |
| `skills/write-test/SKILL.md`, `skills/validate/SKILL.md` | **Deferred — out of scope for this spec** | Dispatch and gate prose. Contended surfaces; required follow-up |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Registry entry | Add `tolerance`; update both count assertions | small |
| Profile markdown | Author `profiles/tolerance.md` | medium |
| Band declaration schema | Machine-readable tuple + exact-metrics list | medium |
| Detection cascade | Entry + explicit non-collision tests against `threshold` globs | medium |
| Immutability check | Band-file SHA-256 in handoff; detect in-place edits | medium |
| Gaming detectors | Post-hoc widening, unjustified band, absorbing band | medium |
| Tests | Profile load, band validation, each error code, `threshold` non-collision | large |

## Acceptance Criteria

- [ ] `getStrategyProfile('tolerance')` loads without falling back to `unit`
- [ ] Profile contains all 8 required contract fields
- [ ] `threshold` detection is unchanged: `k6/**`, `locust/**`, `artillery/**`, `*.bench.*` still return `threshold`
- [ ] `threshold-strategy-profile.spec.md` carries a scope note stating it is performance-only
- [ ] A metric asserted with no declared band blocks with `TOLERANCE_BAND_UNDECLARED`
- [ ] A band edited after a measuring run blocks with `TOLERANCE_BAND_MUTATED`
- [ ] A relative band with no declared minimum population blocks
- [ ] A band on an exact-metrics-list metric is rejected at declaration time
- [ ] An under-populated measurement records `deferred`, never `green`
- [ ] All quality gates pass; no constitutional violations introduced
