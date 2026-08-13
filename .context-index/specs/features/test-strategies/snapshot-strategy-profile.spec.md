---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-blocked
risk_level: medium
milestone:
revision: 1
charter-revision: 5
created: 2026-08-13
updated: 2026-08-13
---

# Live Spec: Snapshot Strategy Profile

**Capability:** Define the `snapshot` strategy profile — a 10th strategy type for
work whose deliverable is *emitted or derived state* (generated configuration,
rendered manifests, migrated datasets, exported artifacts) rather than an edited
source file. RED is established by capturing a checksummed baseline of the
pre-change world; GREEN is established by re-deriving that state after the change
and diffing it against the baseline under an explicit acceptance rule.

> **Charter extension note:** The test-strategies charter (revision 4) defined 9
> strategies. `snapshot` is a 10th, justified by the Quality Attribute
> "Adding a strategy requires only a new profile Live Spec, a registry entry, a
> profile markdown file, and a detection heuristic entry — no changes to the core
> abstraction." The following sibling specs must be updated when this lands:
> - `strategy-type-registry` — "exactly 9 strategy types" → 12; add a registry table row
> - `strategy-profile-contract` — the registered-slug set grows; validation stays dynamic via `getStrategy()`
> - `cross-strategy-gaming-patterns` — precondition "any of the 8 types" → "any registered strategy type"
> - `strategy-detection-heuristics` — add the cascade entry defined in Behavior 7

## Problem and Motivation

The nine shipped strategies all assume the same shape: the agent edits a source
file, and a runner exits non-zero against it. The 2026-08-10 audit surfaced a
project where the deliverable was YAML configuration landing in gitignored
repositories — nothing the agent wrote was the subject under test, and the thing
that mattered (does the emitted config still describe the same world?) had no
adev vocabulary. The team hand-rolled pre-migration data snapshots with SHA-256
checksums because no strategy expressed "capture the world, change it, prove the
change was exactly what was intended."

`fixture` is the nearest shipped strategy and does not fit: it requires a
hand-crafted input fixture and a hand-crafted expected output committed next to a
transform. A snapshot baseline is *captured from a live system*, is often too
large to commit, and its expected value is "identical to the captured baseline
except for the declared intended delta."

## Behavioral Contract

### Preconditions

- The task's deliverable is derived or emitted state — generated config, rendered
  manifests, exported datasets, or a migrated store — not a source file whose
  edit is itself the change under test.
- A deterministic capture procedure exists that can be run twice and produce
  byte-identical output for an unchanged system (see Behavior 3).
- A strategy assignment of `snapshot` has been made (spec frontmatter, manifest
  declaration, or detection).
- If capture requires credentials or network access, the spec declares them under
  `infra_requirements:` so `runPreflight()` can evaluate them.

### Behaviors

**1. RED/GREEN semantics**

- **RED:** A checksummed baseline snapshot of the pre-change state exists and is
  recorded, and re-deriving the state under the current (unimplemented) code
  either fails to produce the intended delta or produces a delta that does not
  match the declared expectation. RED caused by a non-deterministic capture, a
  missing baseline, or unavailable credentials is **not** valid RED.
- **GREEN:** The post-change snapshot differs from the baseline in exactly the
  declared intended delta and in nothing else. A GREEN with an empty declared
  delta is only valid for explicitly-declared refactor/no-op tasks.

**2. Baseline is captured before implementation, never after**

When write-test authors a snapshot task, the baseline capture command runs and
its checksum is recorded in the handoff block **before** any implementation task
begins. A baseline captured after the change has no evidentiary value and is the
defining gaming pattern for this strategy (see Behavior 5).

**3. Determinism requirement**

A capture procedure is admissible only if running it twice against an unchanged
system yields the same checksum. The profile requires the capture to declare how
it neutralises the standard sources of nondeterminism: row ordering (explicit
sort key), timestamps and run IDs (excluded or normalised), floating-point
formatting (fixed precision), map/object key ordering (sorted), and locale or
timezone (pinned). A capture that cannot state its ordering key is inadmissible.

**4. Declared delta, not eyeballed diff**

Every snapshot task declares its **intended delta** ahead of time as a
machine-checkable statement — an allowlist of changed keys/paths/tables, an
expected row-count change, or an explicit "no change expected". GREEN requires
`observed_delta ⊆ declared_delta` **and** `declared_delta ⊆ observed_delta`. A
diff that a human merely reviewed and approved is not GREEN.

**5. Gaming blockers**

The following are prohibited and cause `/adev:validate` to block:

- **Post-hoc baseline:** capturing or re-capturing the baseline after the
  implementation change. Detected by comparing the baseline capture event
  timestamp against the first implementation commit.
- **Baseline overwrite on failure:** re-running capture to "refresh" a baseline
  that no longer matches, instead of explaining the delta. Baselines are
  write-once per task; a legitimate re-baseline requires a new task with its own
  declared delta and an explicit human record.
- **Checksum-only comparison of an empty capture:** a snapshot over zero rows,
  zero files, or an empty document trivially matches itself.
- **Unpinned nondeterminism:** including timestamps, run IDs, or unsorted
  collections in the snapshot, then widening the comparison (normalising the diff
  after the fact) until it passes.
- **Selective scope shrinking:** narrowing the captured scope (fewer tables,
  fewer keys, a `LIMIT`) between RED and GREEN so that the changed region falls
  outside the snapshot.
- **Wildcard delta:** a declared delta of "any change" / `*` / an empty
  allowlist interpreted permissively, which makes Behavior 4 vacuous.
- **Committing the baseline as the expectation:** treating a committed snapshot
  file as the source of truth without a recorded checksum and provenance, so that
  editing the file silently changes the expectation.

**6. Assertion rules**

- Comparison is over a **content checksum plus a structural diff**, never the
  checksum alone — a checksum mismatch must be explainable as a specific set of
  changed paths.
- The snapshot must record provenance: capture command, capture timestamp, source
  identifier (database/host/directory), row or item count, and the ordering key.
- Item/row count and content are both asserted. Count alone is insufficient
  (this is the failure mode `reconciliation-strategy-profile.spec.md` Behavior 4
  also guards against).
- Where the artifact is textual and small enough to commit, it is committed and
  its checksum recorded. Where it is not, only the checksum plus provenance is
  committed and the artifact is stored at a declared, resolvable location.
- Secrets present in captured state (connection strings, tokens, PII columns)
  must be excluded or masked by the capture procedure itself, before checksum,
  and the mask list is part of the provenance record.

**7. Detection heuristics and cascade position**

`detectTaskStrategy` returns exactly one strategy, so `snapshot` claims only
patterns no shipped strategy owns:

| Pattern | Confidence |
|---|---|
| `__snapshots__/**`, `*.snap` | high |
| `snapshots/**`, `baselines/**` containing non-image artifacts | medium |
| `*.snapshot.json`, `*.baseline.json`, `*.baseline.yaml` | high |

Cascade precedence, stated explicitly:

- `visual` is checked **before** `snapshot`. An image baseline under a components
  directory stays `visual`; `snapshot` never claims `.png`/`.jpg`/`.webp`.
- `schema` and `policy` are checked **before** `snapshot`. A snapshot file inside
  `migrations/` or beside `*.tf` stays with its owning strategy.
- `snapshot` is checked **before** `fixture`, because a `__snapshots__/` directory
  under a dbt `models/` tree is a snapshot artifact, not an input fixture.

**8. Handoff format**

The write-test → implement handoff block carries: baseline artifact path or
storage locator, baseline SHA-256, capture command (verbatim), capture timestamp,
source identifier, item/row count, ordering key, mask list, the declared delta,
the comparison command, and the acceptance rule.

**9. Verification outcome recording**

Each snapshot verification records a `VerificationOutcome` per
`verification-ledger-and-deferred-state.spec.md`. A capture that cannot run
because credentials or connectivity are missing records `deferred` with
`reason_code: infra_unavailable` — it never records `green`, and it never records
nothing.

### Postconditions

- A baseline checksum with full provenance exists and predates implementation.
- The post-change snapshot's delta against the baseline equals the declared delta.
- A `VerificationOutcome` is recorded for the task.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No baseline recorded before implementation begins | Block; RED is not established | `SNAPSHOT_NO_BASELINE` |
| Two capture runs against an unchanged system disagree | Block; capture is inadmissible | `SNAPSHOT_NONDETERMINISTIC` |
| Baseline artifact or locator unresolvable at compare time | Block | `SNAPSHOT_BASELINE_MISSING` |
| Declared delta absent, empty, or wildcard | Block | `SNAPSHOT_DELTA_UNDECLARED` |
| Observed delta exceeds declared delta | Fail (this is a real finding, not an error) | `SNAPSHOT_UNDECLARED_DRIFT` |
| Baseline rewritten for an existing task | Block | `SNAPSHOT_BASELINE_OVERWRITE` |
| Snapshot captured zero items | Block | `SNAPSHOT_EMPTY_CAPTURE` |
| Capture blocked by missing credentials | Record `deferred`, do not pass | `SNAPSHOT_DEFERRED_INFRA` |

## System Constitution Reference

- **"Minimize external dependencies"** — profile loading and checksum comparison
  use `node:crypto` and `node:fs` only. adev ships no capture tooling; the
  project supplies its own capture command (see charter Deferred Capabilities).
- **"Skills are primarily markdown"** — the profile is
  `lib/test-strategies/profiles/snapshot.md`, consumed as structured instructions
  by write-test; no executable logic in SKILL.md.
- **"No inline Node in SKILL.md"** — any snapshot comparison logic is reached
  through a named CLI verb, not skill prose.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| `lib/test-strategies/registry.mjs` | High | Add the `snapshot` entry; registry count assertions in `tests/lib/test-strategies/registry.test.mjs` and `tests/evals/test-strategies/test-strategies.test.mjs` update in the same change |
| `lib/test-strategies/profiles/snapshot.md` | High | New profile file with all 8 required contract fields |
| `lib/test-strategies/detection.mjs` | Medium | Cascade entry per Behavior 7, positioned after `visual`/`schema`/`policy` and before `fixture` |
| `lib/test-strategies/gaming.mjs` | Medium | Strategy-specific detectors for post-hoc baseline, empty capture, wildcard delta |
| `templates/manifest-template.yaml` | Low | `snapshot` example in the activated `test_strategies` block |
| `skills/write-test/SKILL.md` | **Deferred — out of scope for this spec** | Dispatch prose for the snapshot profile. Contended surface; sequenced as required follow-up |

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Registry entry | Add `snapshot` to `registry.mjs`; update both count assertions | small |
| Profile markdown | Author `profiles/snapshot.md` with all 8 fields | medium |
| Detection cascade | Add the entry with the precedence in Behavior 7 + tests for the `visual`/`fixture` collisions | medium |
| Gaming detectors | Post-hoc baseline, empty capture, wildcard delta | medium |
| Provenance/handoff format | Document the handoff block fields | small |
| Tests | Profile loads, determinism rule, delta comparison, each error code | medium |

## Acceptance Criteria

- [ ] `getStrategyProfile('snapshot')` loads without falling back to `unit`
- [ ] Profile contains all 8 required contract fields
- [ ] `gaming_blockers` includes post-hoc baseline, baseline overwrite, empty capture, unpinned nondeterminism, scope shrinking, and wildcard delta
- [ ] `listStrategies()` returns 12 entries in alphabetical order; both count assertions updated in the same change
- [ ] Detection returns `visual` (not `snapshot`) for an image baseline under a components directory, and `snapshot` (not `fixture`) for `models/__snapshots__/*.snap`
- [ ] A snapshot task with no declared delta blocks with `SNAPSHOT_DELTA_UNDECLARED`
- [ ] A capture blocked by missing credentials records `deferred`, never `green`
- [ ] Baselines are write-once per task; a re-baseline attempt blocks
- [ ] All quality gates pass; no constitutional violations introduced
