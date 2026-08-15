---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 5
file-sha: 7ad4201ff430ebd555cd8a36ed248e4a258a0a6e286fa1939671250e8242fe48
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 5)
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` resolves the same)
> **Verdict:** BLOCK — 2 blockers, 4 warnings, 7 suggestions
> **Prior verdicts:** BLOCK at revision 1 (6 blockers), revision 2 (2), revision 3 (1), revision 4 (1)

## Convergence against revision 4

Revision 4's sole blocker — `structural-architect:task-map-contradicts-behavior:17ad4a0f`, the Actionable
Task Map's write-path row restating an incoming-wins rule that Behavior 5(b) had removed — is **resolved**.
Both the Structural Architect and the Consistency Analyzer independently verified that the Task Map row
now states existing-wins and cross-references Behavior 5(b), and that the second stale row (the
`migrate-keys` strict `=== "validation"` discriminator) was corrected in the same sweep.

The revision-4 warning about `EvidenceRef.source` drift was folded in: Behavior 8 now normalizes
`validate` → `validation` and `recover` → `recovery` before discriminating, and reports unrecognized
spellings rather than silently treating them as out of scope.

Revision 5's two blockers are both new and land in previously-unblocked territory — the `review-specs`
two-mode verb shape (SA-1) and the migration discriminator's provenance assumption (SA-2). Five rounds,
five disjoint blocker sets, zero `blocker_id` recurrence.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry resolved from bundled domain defaults (`domain: software`, `source_level: default`); project
`.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides applied and no
domain-loader warnings were emitted. Context pack `base` (`include: []`) supplemented with the spec,
parent charter, constitution, both dependent siblings, remaining charter siblings, cross-cutting specs,
ADRs 0001–0019, and `platform-context.yaml`. Module heuristics (3 entries, `summary` tier) injected into
every reviewer pack. No workspace detected and the spec declares no `depends-on` frontmatter, so
cross-repo reference validation was skipped. No severity capping applied (all three reviewers carry
`severity_cap: blocker`).

## Structural Architect (structural-architect)

**Verdict:** BLOCK

The reviewer verified every implementation citation in the spec against the worktree and found them all
accurate: `validateEntry` at `lib/heuristics.mjs:101`; `FIELD_ORDER` at `:185-199` (no `signature` today);
the two `finalEntry` literals at `:733` (update) and `:767` (new); the hook's `hashInput` at
`hooks/post-validate-extract-heuristics.mjs:123-127`, whose `normalizePath` (`:160`) is byte-for-byte the
`normalizeIdInput` the spec describes; `parseBlockerId` at `lib/blocker-id.mjs:110` returning an
8-lowercase-hex `locationHash`, making Behavior 3a's digest reuse mechanically sound and length-compatible.
The live store's source drift is exactly as the spec states: 24 `validation`, 4 `learn`, 2 `validate`,
2 `recover` (independently re-confirmed by the aggregator).

### SA-1 — `blocker` — the governing two-keys table describes a one-mode verb; Behavior 3a defines a two-mode verb

- **blocker_id:** `structural-architect:contradictory-derivation-rule:879a009a`
- **section_anchor:** `two-keys-table`
- **Location:** "Two keys, two rules, one digest function" table; Behavior 1; Behavior 2

**Finding:** The table is declared governing ("the separation governs every behavior below") and states the
`signature` rule with a single hashed input (normalized failure text), a single normalizer
(`normalizeFailureText`), and an origin-slug prefix. Behavior 3a supersedes all three for one of the four
legal origins: for `review-specs` the digest is *inherited* from `parseBlockerId` (a hash over
`<sectionAnchor>:<truncatedFindingText>`), no failure text is hashed, and `normalizeFailureText` never runs.
Behavior 1 restates the same superseded rule for "a legal origin" without carving out `review-specs`, and
Behavior 2's "This normalizer applies to signature derivation only" over-claims that it applies to *all*
signature derivation. Three sections describe a one-mode verb; Behavior 3a defines a two-mode verb. This is
the same lagging-section class that produced the revision-4 blocker.

**Recommendation:** Give the table a second `signature` column (or a mode row) covering the `blocker-id`
derivation path, and scope Behavior 1 and Behavior 2 to the text-input mode explicitly.

### SA-2 — `blocker` — the migration discriminator keys on evidence provenance, not on id provenance

- **blocker_id:** `structural-architect:discriminator-scope-conflict:a2871464`
- **section_anchor:** `behaviors-8`
- **Location:** Behavior 8 ("In scope" / "Out of scope" bullets) vs Behavior 7a and Postconditions

**Finding:** The migration's in-scope test is "at least one `evidence[]` element whose normalized `source`
is `validation`", justified by "Its `id` came from the absolute-path hash." That premise does not hold
universally. An entry may carry *both* `validation` and `recovery` evidence — reachable through
`/adev:retro` consolidation, which the charter charters as "merge duplicates" — while its `id` was composed
by the recover rule (`<category-slug>-<digest>`). Behavior 8's in-scope test would rekey such an entry to
`<spec-slug>-<digest>`, contradicting Behavior 7a's and `failure-capture.spec.md` Behavior 6's guarantee
that recover ids remain byte-identical. The out-of-scope bullet makes the conflict explicit rather than
resolving it ("whatever its other sources are"). The discriminator keys on evidence provenance, but the
property it must discriminate on is *which derivation rule produced the id* — those diverge for
mixed-evidence entries, and no acceptance criterion covers the mixed case.

**Recommendation:** Add an id-provenance guard to the in-scope test — rekey only when the entry's stored
`id` reproduces under the old absolute-path rule (or restrict scope to entries whose evidence is
exclusively `validation`-sourced) — and add an acceptance criterion for a mixed-evidence fixture.

### SA-3 — `warning` — Error Cases row 2 is unscoped against the blocker-id mode

**Location:** Error Cases, row 2 (`--text` missing or empty)

**Finding:** `EMPTY_SIGNATURE_TEXT` is stated unconditionally, but a well-formed
`--origin review-specs --blocker-id <id>` invocation has no `--text` by design (Behavior 3a). The table
gives no precedence between row 2 and row 3, so the correct exit for the legal blocker-id invocation is
ambiguous.

**Recommendation:** Scope row 2 to the text-input mode, or state that the mode is selected by `--origin`
before the text check applies.

### SA-4 — `warning` — Behavior 8's alias argument and its reported-counts sentence both stop short

**Location:** Behavior 8, alias-normalization bullet and its closing "The verb reports counts of…" sentence

**Finding:** Two lags. (a) The bullet argues alias folding is "required, not cosmetic" because strict
equality strands drifted spellings, then folds only two of the three drifted spellings — `learn` (4 live
entries, and absent from the charter's `EvidenceRef.source` enum) falls to the unrecognized path. The
outcome is benign (`learn` is effectively `manual`, correctly out of scope), but the spec's own
completeness argument is left unfinished. (b) The closing sentence enumerates four reported counts
(rekeyed, skipped-out-of-scope, skipped-unrecoverable, merged) and omits the unrecognized-source-spelling
report that the same behavior's bullet, the Task Map row, and an Acceptance Criterion all require — one
section lagging three.

**Recommendation:** Add `learn` → `manual` to the alias map (or state explicitly why it is left unaliased),
and add the unrecognized-spelling report to the enumerated verb output.

### SA-5 — `suggestion` — one error code covers a conflict and an omission

**Location:** Error Cases, row 3

**Finding:** `CONFLICTING_SIGNATURE_INPUT` covers three conditions, one of which — `--origin review-specs`
with no `--blocker-id` — is a *missing required input*, not a conflict. A single code for both makes the
failure less diagnosable.

**Recommendation:** Consider `MISSING_BLOCKER_ID` for the omission case; keep `CONFLICTING_SIGNATURE_INPUT`
for the two genuine conflicts.

### SA-6 — `suggestion` — charter interface rows lag the verb shape (known lag, reported per instruction)

**Location:** Charter Interface Contracts / Domain Model

**Finding:** Three charter rows lag the verb's two-input shape: the Exposed API row for
`adev heuristics signature` shows only `--origin/--text`; the Consumed API row names `buildBlockerId` where
the spec consumes `parseBlockerId`; and `FailureSignature.digest` is described as "SHA-256 prefix over the
normalized failure text", which is false for the `review-specs` origin. Separately, the charter's
`EvidenceRef.source` enum omits `learn`, which the live store contains. None of these blocks the spec.

**Recommendation:** Fold all four into the queued charter revision once this spec settles.

**Sections swept with no finding:** Preconditions (the fail-closed `id` / no-precondition `signature` split
is consistent with Error Cases and the Constitution Reference); Behaviors 3, 3b, 4, 5, 5a, 5b, 6, 7, 9, 10;
Postconditions (the deliberate scoping to migrated entries, and the deferral of the repo-wide "no copy
remains" assertion to `failure-capture.spec.md`, are both correct and non-contradictory); System
Constitution Reference; Actionable Task Map (the revision-4 write-path row now correctly states
existing-wins, matching Behavior 5(b)); Acceptance Criteria. Dependency direction is sound —
`lib/blocker-id.mjs` is consumed, not owned, matching `review-block-auto-retry.spec.md`. No ADR conflict
found across 0001–0019; ADR-0010 is untouched because the charter explicitly routes around check-ID keying.

## Security Reviewer (security-reviewer)

**Verdict:** PASS (three `suggestion` findings, no blockers or warnings; the reviewer self-reported
PASS_WITH_NOTES, and the aggregator's `computeVerdict` rule resolves a suggestions-only set to PASS)

Threat model applied: local developer CLI plus a git-tracked markdown memory store — no network surface, no
multi-tenant auth. Classic web-application categories (authentication, authorization, rate-limiting-as-DoS
defense) do not apply to this surface and were weighed accordingly.

### SEC-1 — `suggestion` — `input-validation` — migration path resolution is not stated to fail closed on escape

**Finding:** Behavior 8's "Unrecoverable input" rule handles only the case where an evidence `path` cannot
be resolved to a repo-relative spec path at all. It does not state that a path resolving *outside* the
project root (via `../../` traversal or an absolute path elsewhere) must also be treated as unrecoverable.
As specified the migration uses that resolved path only as a hash-input string, never as a read or write
target, so worst case today is a wrong hash input rather than filesystem access outside the repo.

**Recommendation:** Extend the Unrecoverable-input bullet to state that a path resolving outside the project
root is also unrecoverable and skipped, so the fail-closed posture already used for unresolvable project
roots applies consistently and any future implementation that does touch the filesystem inherits the guard.

### SEC-2 — `suggestion` — `rate-limiting` — `--text` has no stated maximum length

**Finding:** `normalizeFailureText` → SHA-256 is cheap even on large input and CLI argument length is
already OS-bounded by `ARG_MAX`, so this is not a real DoS vector in the stated threat model. But failure
text can originate from subprocess output (validate, recover, review) that the operator does not fully
control, so an unbounded value is a minor abuse surface when the verb is invoked non-interactively.

**Recommendation:** Add an explicit cap — truncate `--text` to N characters, mirroring
`BLOCKER_FINDING_TEXT_TRUNCATE` (200) in `lib/blocker-id.mjs` — before normalization, for consistency with
the sibling reviewer-finding hash.

### SEC-3 — `suggestion` — `input-validation` — a literal `|` in either id component can collide the hash input

**Finding:** `normalizeIdInput`'s hash input is `<repo-relative-spec-path>|<pattern>`, and `|` is
deliberately preserved as a meaningful separator (Two Keys table). If either component contained a literal
`|`, two distinct (path, pattern) pairs could compose an identical hash-input string, producing a spurious
`id` collision. Spec paths are repo-controlled and `pattern` is templated or caller-normalized, so this is a
correctness edge case rather than an exploitable one.

**Recommendation:** State (in the spec, or delegate to implementation) that the composer rejects or escapes
a literal `|` in either component before concatenation.

**Explicitly not flagged, because the spec or constitution already handles them:** the digest is one-way, so
`--text` content that may carry secrets is never stored — only the 8-hex prefix is; Behavior 5(b)'s
divergence warning logs `signature` values, not raw failure text; Behavior 3's control/ANSI stripping and
truncation before echoing a rejected `--origin`; atomic temp-then-rename writes and fail-closed behavior on
an unresolvable project root; `--blocker-id` validation delegated to `parseBlockerId`, which already
enforces `[a-z0-9-]+` component allowlists and 8-hex-lowercase hash shape.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

**Internal sweep result:** no section restates a rule another section has superseded — the revision-4 defect
class is not repeated. The two-keys table, Preconditions, Behaviors 1–10 (including 3a, 3b, 5a, 5b, 7a),
Postconditions, Error Cases, Constitution Reference, Task Map, and Acceptance Criteria are mutually aligned
on prefix ownership, normalizer scope, existing-wins semantics, and fail-closed `id` derivation.

### CON-1 — `warning` — `contract` — the `_format.md` revision is missing from the Task Map and the AC

- **This Spec:** The Actionable Task Map lists eight tasks (digest function, normalizers, verb, hook fix,
  harnesses, `migrate-keys`, tests) — none updates `.context-index/memory/heuristics/_format.md`, and no
  acceptance criterion asserts the doc changes.
- **Conflicts With:** `charter.md:152`, Capability Map row "Signature Schema Field" (milestone 3, status
  `specified`): "`signature` field on the heuristic schema, added to `FIELD_ORDER`… `_format.md` revision;
  read path for entries that predate the field." `_format.md` also self-identifies (line 3) as "the
  authoritative specification", and its `ID Namespace Convention` section (lines 219-227) still documents
  the `/adev:validate` id as hashing only "the generalized pattern text" — silently wrong once Behavior 7
  lands (`<repo-relative-spec-path>|<pattern>`).
- **Recommendation:** Spec-side. Add a Task Map row and an AC item for the `_format.md` update (Frontmatter
  Schema table gains `signature`; ID Namespace Convention corrected).

### CON-2 — `warning` — `domain-model` — `learn`-sourced evidence falls between the alias branch and the report branch

- **This Spec:** Behavior 8 aliases `validate` → `validation` and `recover` → `recovery`, defines in-scope
  as `validation`-sourced (post-alias), and separately promises to "report any source spelling it does not
  recognize rather than silently treating it as out of scope." The out-of-scope enumeration lists only
  `recovery`, `debug`, `retro`, `manual`.
- **Conflicts With:** The charter's `EvidenceRef.source` enum (`charter.md:99`:
  `recovery | validation | debug | retro | manual`) has no `learn` value, yet the live store carries four
  `learn`-sourced entries. `learn` is simultaneously "out of scope" (fails the `validation` discriminator)
  and "unrecognized" (not in the enum, not aliased) — the spec does not say which branch wins, and no
  Behavior text or AC exercises `learn` despite it being the second-largest spelling anomaly in the corpus.
- **Recommendation:** Spec-side. State explicitly whether unrecognized-and-out-of-scope entries like `learn`
  are silently skipped or hit the report branch, and add an AC case for the `learn` spelling alongside the
  existing `validate`/`validation` one.

### CON-3 — `suggestion` — `contract` — charter Phase 3 rows lag the two-input verb shape

- **This Spec:** Behavior 3a adds a `--blocker-id` input path deriving the signature via `parseBlockerId`,
  reusing an already-built id's hash component.
- **Conflicts With:** `charter.md:182` (Exposed API row documents only `--origin/--text`), `charter.md:198`
  (Consumed API row names `buildBlockerId`, but the spec consumes `parseBlockerId` on a pre-existing id, not
  the builder), and `charter.md:97` (`FailureSignature.digest` = "SHA-256 prefix over the normalized failure
  text", which does not cover the blocker_id-derived case).
- **Recommendation:** Charter-side, deferred per the spec's own note. No action needed now; flagged for the
  queued charter revision. Overlaps SA-6.

### CON-4 — `suggestion` — `pattern` — the AC under-specifies Behavior 9's archive outcome

- **This Spec:** Behavior 9 states a two-contradiction merge is *archived* ("the merged entry is archived
  per the same invariant"). The corresponding acceptance criterion only asserts "does not remain at `high`
  confidence" — satisfied even by a demotion to `medium`, not just by archival.
- **Conflicts With:** Nothing external; an internal Behavior ↔ AC coverage gap of exactly the kind this
  review round watches for.
- **Recommendation:** Tighten the AC to assert archival, not merely non-`high`, so a regression to "merge
  demotes but does not archive" would be caught.

**Verified consistent, no findings:** `parseBlockerId` and `INVALID_BLOCKER_ID` usage matches
`lib/blocker-id.mjs` exactly; the origin enum (`recover` / `validate` / `review-specs` / `implement`)
matches the charter's `FailureSignature.origin`; `id`/`signature` independence, existing-wins semantics, and
location-independence all match the charter Invariants; hook-protocol exit-code usage is correct; the
preconditions of `failure-capture.spec.md` and `signature-retrieval.spec.md` match this spec's
postconditions.

---

## Summary

**Total findings:** 13 (2 blockers, 4 warnings, 7 suggestions)

| Reviewer | Verdict | Blockers | Warnings | Suggestions |
|---|---|---|---|---|
| structural-architect | BLOCK | 2 | 2 | 2 |
| security-reviewer | PASS | 0 | 0 | 3 |
| consistency-analyzer | PASS_WITH_NOTES | 0 | 2 | 2 |

**Blocker IDs (for revise-loop partitioning):**

- `structural-architect:contradictory-derivation-rule:879a009a` — anchor `two-keys-table`
- `structural-architect:discriminator-scope-conflict:a2871464` — anchor `behaviors-8`

Neither recurs from the prior set `{17ad4a0f}`. Both parse cleanly under
`lib/blocker-id.mjs::parseBlockerId`, both carry a `section_anchor`, so no `LEGACY_REVIEWER_OUTPUT`,
`INVALID_BLOCKER_ID`, or `MISSING_SECTION_ANCHOR` advisory was raised and the sidecar is complete.

**Action required:** Both blockers are cross-section consistency defects of the same family that blocked
revisions 3 and 4 — a rule stated in one section that a later, more specific section supersedes. SA-1 needs
the two-keys table, Behavior 1, and Behavior 2 scoped to the text-input mode so Behavior 3a's blocker-id
mode is no longer contradicted. SA-2 needs Behavior 8's in-scope test to discriminate on id provenance
rather than evidence provenance, so a mixed-evidence entry cannot break the byte-identical recover-id
guarantee that `failure-capture.spec.md` Behavior 6 depends on.

Address both, plus the four warnings (SA-3, SA-4, CON-1, CON-2) while the sections are open, then re-review.
The suggestions — SA-5, SA-6, SEC-1, SEC-2, SEC-3, CON-3, CON-4 — are optional; SA-6 and CON-3 are
charter-side and already queued.

**Governance footer:** `.context-index/governance/gates.yaml` declares `transitions: {}` — no
`spec-to-plan` transition and therefore no `approver_role` to record. Per
`.context-index/governance/risk-policies.yaml`, this spec's `risk_level: high` sets
`require_hitl_approval: true`, so human approval is required at the spec-to-plan boundary once the review
verdict clears.

**Next step:** `/adev:specify --revise --spec .context-index/specs/features/heuristics/failure-signature-key.spec.md`
to address the blockers (blocker detail is in
`.context-index/specs/features/heuristics/failure-signature-key.blockers.md`), then re-run
`/adev:review-specs` on revision 6.
