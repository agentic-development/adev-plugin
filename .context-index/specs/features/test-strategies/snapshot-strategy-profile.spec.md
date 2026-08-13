---
charter: test-strategies
charter-extension: true
kind: behavioral
status: review-pending
risk_level: medium
milestone:
revision: 3
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
> abstraction."
>
> **Shared 9 → 12 update surface.** The following list is common to all three new
> profile specs and is the authoritative one; earlier drafts undercounted it.
> Every item must land in the same change as the registry entries:
>
> | Site | What changes |
> |---|---|
> | `lib/test-strategies/registry.mjs` | three new entries, alphabetical order preserved |
> | `tests/lib/test-strategies/registry.test.mjs:31` | `assert.equal(listStrategies().length, 9)` → 12 |
> | `tests/evals/test-strategies/test-strategies.test.mjs:924` | count assertion → 12, and the `expectedStrategies` **array** |
> | `tests/evals/test-strategies/test-strategies.test.mjs:436` | "all 9 profiles load without fallback" title **and** its 9-element `ids` array |
> | `tests/evals/test-strategies/test-strategies.test.mjs:740` | "across all 9 strategies" title **and** its `ids` array; this is a profile-contract sweep the new profiles must pass |
> | `tests/docs/advanced-guides.test.mjs:161` | hardcoded 9-slug array |
> | `docs/test-strategies.md:36` | "The 9 strategies" heading and body |
> | `strategy-type-registry.spec.md` | "exactly 9 strategy types" → 12; three registry table rows |
> | `strategy-profile-contract.spec.md` | AC "any of the 9 strategy IDs" → any registered ID; validation stays dynamic via `getStrategy()` |
> | `strategy-detection-heuristics.spec.md` | Behavior 16 and its ACs; append the three new cascade rules |
> | `manifest-schema-extension.spec.md` | Behavior 1 still hardcodes "one of the 8 types" — stale since `integration` landed; this spec set adopts the fix |
> | `charter.md` Capability Map | the "Strategy Type Registry" row still reads "Define the 9 strategy types" |
>
> **Not** in the list: `cross-strategy-gaming-patterns.spec.md` already reads "any
> registered strategy type" (migrated when `integration` landed). Earlier drafts
> copied that instruction from the integration profile's note in error.
> `docs/concepts.md` was also listed in error — it contains no strategy count.
>
> ### Canonical order of the three new detection rules
>
> All three new rules are appended after the shipped cascade, so their order
> **relative to each other** must be stated once, here, rather than each spec
> claiming to be "last". Appended in this order:
>
> 1. `reconciliation`
> 2. `tolerance`
> 3. `snapshot`
>
> Rationale: directory-anchored rules resolve before extension-anchored ones, and
> `snapshot`'s patterns are the broadest, so it goes last. This settles the two
> real collisions among the new rules: `tolerances/x.baseline.json` resolves to
> `tolerance` (not `snapshot`, whose `*.baseline.json` pattern also matches), and
> `reconciliation/__snapshots__/x.snap` resolves to `reconciliation` (not
> `snapshot`). Each profile spec's "every earlier rule wins by construction"
> statement is scoped to the **shipped** rules above all three; among the three,
> this ordering governs.

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
  implementation change. Detection requires a durable record of when the baseline
  was captured, which the write-test handoff block alone does not provide. The
  recording surface is the `strategy_verification` event defined in
  `verification-ledger-and-deferred-state.spec.md` Behavior 5, whose payload
  carries `baseline_checksum` and `baseline_captured_at` for exactly this purpose.
  The check compares `baseline_captured_at` against the first commit touching the
  task's implementation files. **This gaming blocker is therefore enforceable only
  once that event is approved and landed** (a `[BOUNDARY: human-approved]`
  change); until then it is an advisory rule stated in the profile, and the
  profile says so explicitly rather than implying automated enforcement.
- **Baseline overwrite on failure:** re-running capture to "refresh" a baseline
  that no longer matches, instead of explaining the delta. Baselines are
  write-once per task; a legitimate re-baseline requires a new task with its own
  declared delta and an explicit human record. Write-once is enforced by comparing
  the `baseline_checksum` on the task's most recent `strategy_verification` event
  against the checksum being recorded — the same substrate dependency as the
  post-hoc-baseline rule above, and likewise advisory until that event lands.
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
- The mask list is **checked against the source schema** before a baseline is
  accepted, rather than trusted on the capture procedure's self-report: every
  column or key in the captured scope whose name matches the project's declared
  sensitive-field patterns must appear in the mask list or in an explicit
  reviewed exclusion. A baseline whose mask list omits a matching field is
  rejected with `SNAPSHOT_MASK_INCOMPLETE`. This matters because adev ships no
  capture tooling, so masking is entirely project-authored code.

**7. Detection heuristics and pattern-level exclusions**

`detectTaskStrategy` evaluates a **fixed linear rule list** and returns the first
match. Adding a strategy therefore means appending a rule whose patterns are
disjoint from every rule above it — **not** claiming a position "before" an
earlier rule. This spec requests no reordering or modification of any shipped rule.

`snapshot` is appended after the shipped cascade and **after the other two new
rules** — the canonical order is `reconciliation` → `tolerance` → `snapshot`, set
once in the charter extension note above. `snapshot` is therefore last overall,
which is why `tolerances/x.baseline.json` resolves to `tolerance` and
`reconciliation/__snapshots__/x.snap` resolves to `reconciliation`. It claims
only:

| Pattern | Confidence |
|---|---|
| `__snapshots__/**` **and** `*.snap` | high |
| `*.snapshot.json`, `*.baseline.json`, `*.baseline.yaml`, `*.baseline.yml` | high |
| `snapshots/**`, `baselines/**` where the extension is not an image type | medium |

Because `snapshot` is last, every earlier rule wins by construction. The
consequences are stated so they are chosen rather than discovered:

- **`fixture` wins for `models/**/*.sql`.** A `.sql` file under a dbt `models/`
  tree resolves to `fixture` even inside a `__snapshots__/` directory. Snapshot
  work in a dbt project must be declared through the manifest `test_strategies`
  block or spec frontmatter rather than auto-detected. This is a deliberate
  accepted limitation.
- **`schema`, `policy`, `contract`, `visual`, `threshold`, and `integration`** all
  win over `snapshot` for any path they already claim.
- **`snapshot` never claims image extensions** (`.png`, `.jpg`, `.jpeg`, `.webp`,
  `.gif`) — image baselines are `visual`'s domain. Note that a bare
  `src/components/__snapshots__/Button.png` matches no shipped rule today and
  resolves to `unit`. **This spec does not change that**, because doing so would
  require editing the validated `visual` rule, which is out of scope here.

**7a. Multi-path resolution**

`detectTaskStrategy` iterates a task's **file paths in the outer loop** and rules
in the inner loop, so the first *path* that matches any rule decides — rule
precedence applies only within a single path, never globally across a task's
paths. Where a task mixes snapshot artifacts with other file kinds, the strategy
must be declared explicitly rather than detected.

**7b. Semantic discriminator from `visual`**

The extension carve-out above is a mechanical rule; the semantic one is that
`snapshot` requires a machine-checkable **declared delta** (Behavior 4) and
`visual` has no such concept — a visual baseline is approved by a human eye, a
snapshot baseline is compared against a pre-stated expectation. A project that
snapshots rendered PNGs is doing `visual` work unless it can declare the delta.

**8. Handoff format**

The write-test → implement handoff block carries: baseline artifact path or
storage locator, baseline SHA-256, capture command, capture timestamp, source
identifier, item/row count, ordering key, mask list, the declared delta, the
comparison command, and the acceptance rule.

**8a. Credential rule for recorded commands**

Commands are recorded literally, but a command embedding a **credential value**
literally is rejected. Credentials are referenced **only** by named environment
variable (`$VAR` / `${VAR}`), matching the constraint the `infra_requirements`
`probe` field already imposes and the spec template's "env var names only — MUST
NOT contain actual credential values" rule. `pg_dump "postgresql://u:pw@h/db"` is
rejected with `SNAPSHOT_CREDENTIAL_IN_COMMAND`; `pg_dump "$SNAPSHOT_SOURCE_URL"`
is accepted. Connection-string variables embed passwords and are treated as
secrets, as `integration-strategy-profile.spec.md` already states.

**8b. Path containment**

The baseline artifact path and storage locator, where they resolve to local
paths, are subject to the same project-root containment check applied to
`evidence_ref` in `verification-ledger-and-deferred-state.spec.md`. A locator
escaping the project root is rejected with `SNAPSHOT_LOCATOR_OUT_OF_ROOT`.

**8c. Remaining required profile fields**

`getStrategyProfile('snapshot')` must return all 8 contract fields without
falling back to `unit`. Two do not follow from the behaviors above and are
defined here:

- **`seed_data_rule`:** *"Snapshot data is captured, not authored. The rule is a
  capture rule: the captured population must be the full declared scope at a
  declared point in time, produced by the recorded capture command under the
  recorded ordering key and mask list, with no manual editing of the captured
  artifact between capture and checksum."*
- **`permitted_tools`:** adev ships no capture tooling, so the effective list is
  resolved from the **project's declared commands** — the manifest
  `test_strategies` entry for `snapshot` merged with the domain profile via
  `lib/domains/merge-test-config.mjs`, the same resolution the `unit` profile
  uses. The profile file nonetheless carries a **non-empty** default list
  (`pg_dump`, `mysqldump`, `sqlite3`, `jq`, `sha256sum`, `git diff`,
  `node:crypto`) because `loadProfile()` treats an empty array as a missing field
  and falls back to `unit`.

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
| Recorded command embeds a literal credential value | Block | `SNAPSHOT_CREDENTIAL_IN_COMMAND` |
| Baseline locator escapes the project root | Block | `SNAPSHOT_LOCATOR_OUT_OF_ROOT` |
| Mask list omits a field matching a declared sensitive-field pattern | Block | `SNAPSHOT_MASK_INCOMPLETE` |
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
| `lib/test-strategies/registry.mjs` | High | Add the `snapshot` entry; **every site in the shared 9 → 12 table above** updates in the same change — including the ID *arrays* and describe titles, not only the two `assert.equal(…, 9)` lines |
| `lib/test-strategies/profiles/snapshot.md` | High | New profile file with all 8 required contract fields, including the `seed_data_rule` and non-empty `permitted_tools` defined in Behavior 8c |
| `lib/test-strategies/detection.mjs` | Medium | **Append** the cascade rule per Behavior 7 at the end of the rule list. No shipped rule is reordered or modified |
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

- [ ] `getStrategyProfile('snapshot')` loads without falling back to `unit`, with a non-empty `permitted_tools` default and the `seed_data_rule` from Behavior 8c
- [ ] Profile contains all 8 required contract fields and passes the profile-contract sweep at `tests/evals/test-strategies/test-strategies.test.mjs:740`
- [ ] `gaming_blockers` includes post-hoc baseline, baseline overwrite, empty capture, unpinned nondeterminism, scope shrinking, and wildcard delta
- [ ] `listStrategies()` returns 12 entries in alphabetical order, and **every site in the shared 9 → 12 table** is updated in the same change
- [ ] The `snapshot` detection rule is **appended** at the end of the cascade; a regression test asserts no shipped rule changed its result (`models/x.sql` → `fixture`, `k6/load.js` → `threshold`, `migrations/1.sql` → `schema`)
- [ ] `models/__snapshots__/x.sql` resolves to `fixture` — the documented, accepted consequence of appending last
- [ ] `config/__snapshots__/a.snap` resolves to `snapshot`; `snapshots/baseline.png` does not
- [ ] A snapshot task with no declared delta blocks with `SNAPSHOT_DELTA_UNDECLARED`
- [ ] A capture command containing a literal credential blocks with `SNAPSHOT_CREDENTIAL_IN_COMMAND`; the `$VAR` form is accepted
- [ ] A baseline locator escaping the project root blocks with `SNAPSHOT_LOCATOR_OUT_OF_ROOT`
- [ ] A capture blocked by missing credentials records `deferred`, never `green`
- [ ] The post-hoc-baseline and write-once rules are documented as **advisory until** the `strategy_verification` event carrying `baseline_checksum` / `baseline_captured_at` is human-approved and landed
- [ ] All quality gates pass; no constitutional violations introduced
