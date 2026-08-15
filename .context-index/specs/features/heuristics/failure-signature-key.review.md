---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
date: 2026-08-15
verdict: PASS_WITH_NOTES
rigor-tier: full
last-reviewed-revision: 8
file-sha: 20ebc536bd8c4a6adbb11d9cc9a19219ecf6bbaf4dd296b2c659534513ac547d
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** .context-index/specs/features/heuristics/failure-signature-key.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md (approved, revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; risk_level `high` maps to `review_mode: full` independently)
> **Verdict:** PASS_WITH_NOTES — 0 blockers, 6 warnings, 7 suggestions

<!-- Regenerated artifact. The revision-8 spec text was previously reviewed and returned
     PASS_WITH_NOTES; that .review.md was destroyed by an out-of-band `git checkout HEAD -- .`
     which reverted this file to a stale revision-7 BLOCK report. The spec text itself was not
     reverted. This round re-reviews the same revision-8 text and, because all 9 plan tasks have
     since shipped (68c71627..928375d2, 152 passing tests), checks the spec against real code
     rather than against intent. -->

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

Registry: domain `software` (source level `default`), three bundled reviewers, all `dispatch: always`,
`severity_cap: blocker`, `context_pack: base`. `.context-index/governance/review.yaml` declares
`reviewers: []`, so no overlay applied. No severity was clamped. No `blocker_id` validation advisories
were raised (`LEGACY_REVIEWER_OUTPUT` / `INVALID_BLOCKER_ID` / `MISSING_SECTION_ANCHOR` all clean),
because no reviewer emitted a blocker.

Module heuristics were injected at `summary` tier (three medium-confidence entries under the
`heuristics` module).

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — *Behaviors §8, bullet "New-key inputs, once an entry qualifies"*. The claim
  that a migrated entry "lands on the id a fresh extraction would produce" holds only when the stored
  `pattern` equals what today's extractor would emit. Confirmed against shipped code: `planRekey`
  (`lib/cli/heuristics.mjs:1091-1096`) recomputes from `canonicalSpecSlug(specPath)` + `entry.pattern`
  — the *stored* pattern.
  **Consistent with the prior adjudication of `structural-architect:mutable-hash-input:a15235f5`
  (BLOCKER → WARNING, operator-accepted).** The shipped code did not change the analysis.
  *Recommendation:* leave the text as adjudicated; keep the plan's prohibition on any test asserting
  that equality (`failure-signature-key.plan.md:16` and `:674` both carry it, and no test in
  `tests/cli/heuristics-migrate-keys.test.mjs` asserts `migratedId === freshExtractionId`).

- **SA-2** (warning) — *Behavior 8 / Error Cases / Acceptance Criteria*. The shipped verb accepts
  `--dry-run` (`MIGRATE_KEYS_USAGE` at `lib/cli/heuristics.mjs:824`, parsed at `:837`, summary header
  `migrate-keys (dry run — nothing written)` at `:1159`; tested at
  `tests/cli/heuristics-migrate-keys.test.mjs:730`). The revision-8 spec defines no dry-run mode
  anywhere — undeclared public CLI surface on a destructive verb.
  *Recommendation:* add `--dry-run` to Behavior 8 (classify + report, write nothing, exit 0).

- **SA-3** (warning) — *Behavior 9 / Error Cases table*. Behavior 9 says a merged entry "is archived
  per the same invariant" but never specifies the archive contract. Shipped code writes
  `<scope-dir>/archive/<scope>-<id>.md` stamping `archived` / `archivedReason: "contradicted"`, and
  `assertNoArchiveConflict` (`lib/cli/heuristics.mjs:904-917`) exits 1 with
  `MIGRATION_ARCHIVE_CONFLICT (HEURISTICS_ARCHIVE_CONFLICT)` when a target exists or is claimed twice
  — an error path absent from the Error Cases table.
  *Recommendation:* name the archive target shape and add the conflict row (exit 1, nothing written).

- **SA-4** (warning) — *Behavior 9 (merge contract)*. The spec names three merged fields (evidence
  union, `contradicted-by` union, higher confidence). `mergeColliding`
  (`lib/cli/heuristics.mjs:1024-1058`) also reconciles four more with distinct rules: `created`
  (earlier wins), `signature` (existing wins), `tags` (existing non-empty wins), `antiPattern`
  (existing truthy wins). Ownership of those transformations is unspecified, so the postcondition
  "no entry has lost evidence, confidence, or contradiction history" does not cover them.
  *Recommendation:* enumerate the per-field merge rule for every field the merged entry carries.

- **SA-5** (warning) — *Behavior 9 (scope of merge)*. Behavior 9 reads unconditionally, but shipped
  `planRekey` merges only collisions the migration *created*; a pair that already shared an id
  pre-run is deliberately left as two entries. Defensible, but a real narrowing of the stated
  contract, and it interacts with Behavior 10's byte-identity guarantee.
  *Recommendation:* add the qualifier "a collision the migration created" to Behavior 9.

- **SA-6** (warning) — *Behavior 5a*. "The stored `signature` is preserved in every case — whether
  the incoming entry omits one, carries the same one, or carries a *different* one" is contradicted by
  `lib/heuristics.mjs:1015-1032`: preservation is gated on `SIGNATURE_PATTERN.test(existing.signature)`,
  so a malformed stored signature (reachable via hand-edit) is discarded and the incoming value
  adopted, with a stderr notice. Four cases in code, three in spec. The code's behavior is the better
  one — existing-wins would otherwise make bad on-disk data permanently unfixable.
  *Recommendation:* add the malformed-stored-signature case, or scope "preserved" to well-formed
  stored values.

- **SA-7** (suggestion) — *Postconditions bullet 3 vs Behavior 8 closing paragraph*. The postcondition
  says ambiguity-guard hits are "reported in the skip counts", but `classifyPlan` counts ambiguous
  entries into a separate `ambiguous` list, deliberately excluded from `skipped-out-of-scope` and
  `skipped-unrecoverable`. Behavior 8's closing sentence names four counts; the verb emits seven keys
  plus detail lines. Align the wording: ambiguous / unrecognized-sources / archived are reported
  channels of their own, not skip counts.

- **SA-8** (suggestion) — *charter alignment; known, queued*. Charter `FailureSignature.digest`
  ("SHA-256 prefix over the normalized failure text", `charter.md:97`) and the Exposed API row
  (`charter.md:182`, `--origin <slug> --text <text>`) describe a single-mode verb; the shipped verb
  has an inherited mode that hashes nothing (Behavior 3a). Same for the `EvidenceRef.source` enum vs
  the four live spellings. Known defect (a)/(b) — not blocking.

**Structure assessment.** API shape (two modes, four typed error codes, exit contract), dependency
direction (consumes `parseBlockerId` from the cross-cutting owner; owns neither `blocker_id` nor loop
control), and module boundaries (removals delegated to `failure-capture.spec.md`, retrieval to
`signature-retrieval.spec.md`) are clean and match the shipped code. No ADR conflict; ADR-0016 and
ADR-0005 are respected — the migration writes only under `.context-index/memory/heuristics/`.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

Threat model: local developer CLI plus a git-tracked markdown store. No network endpoint, no auth
surface, no multi-tenant boundary.

Verified against shipped code:

- **Behavior 3 echo sanitization** — implemented. `sanitizeForEcho` (`lib/cli/heuristics.mjs:548`)
  strips ANSI CSI sequences and C0/C1 control characters (including U+2028/U+2029) and truncates to 40
  chars, applied to the rejected `--origin`, `--blocker-id`, and `parseBlockerId` error messages. The
  `EMPTY_SIGNATURE_TEXT` path never echoes `--text` at all — stronger than the spec requires.
- **Migration write path** — `atomicWrite` (`lib/heuristics.mjs:597`) is temp-file-with-random-suffix
  plus rename, with temp cleanup on failure; `applyPlans` writes only after the full read-and-classify
  pass succeeds (fail-closed on `MIGRATION_READ_FAILED`). The `.validate.md` → `.spec.md` mapping is a
  pure string suffix swap used only as a hash input — it never opens a file, so there is no traversal
  read surface. Archive targets are built from a `SAFE_SLUG_PATTERN`-constrained `id` plus
  `basename(plan.file)`, and `assertNoArchiveConflict` refuses to overwrite before any write occurs.
- **Fail-closed root resolution** — `hooks/post-validate-extract-heuristics.mjs:86-87`
  returns immediately when `resolveProjectRoot()` yields `null`, writing nothing, warning to stderr
  only, and not failing the lifecycle step. Matches the Error Cases row exactly.

Findings:

- **SEC-1** (suggestion, data-exposure) — Neither `validateEntry` nor the migration inspects `pattern`
  or `title` for secret-shaped text before it lands in the git-tracked store. This is an inherent
  property of the heuristics capture design, not something this spec changes or regresses; capture
  content policy belongs to `failure-capture.spec.md` and the charter. Forward-looking note only.
- **SEC-2** (suggestion, input-validation) — `runSignature`'s `--text` has no length cap before
  hashing (unlike `FIELD_LENGTH_CAPS` enforced later at `writeHeuristic` time). Not exploitable for a
  local single-user CLI, but capping at the verb would fail faster and more clearly than a downstream
  `validateEntry` rejection.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No blocking or warning-level consistency issues. Verified spec-against-shipped-code:

- **Error codes** — all five (`INVALID_SIGNATURE_ORIGIN`, `EMPTY_SIGNATURE_TEXT`,
  `CONFLICTING_SIGNATURE_INPUT`, `INVALID_BLOCKER_ID`, `MIGRATION_READ_FAILED`) match the shipped
  strings.
- **Verb and flags** — `adev heuristics signature --origin --text --blocker-id` matches Behaviors 1,
  3, 3a, 3b; `adev heuristics migrate-keys` matches Behaviors 8-10.
- **Recover diagnosis categories** — the closed six-value set (`missing-context`, `ambiguous-spec`,
  `constraint-conflict`, `novel-problem`, `tool-failure`, `budget-exhaustion`) matches
  `skills/recover/SKILL.md`, `_format.md`, and `lib/cli/heuristics.mjs:694-699`. Classification uses
  exact segment matching, not `startsWith`, so `missing-contextual-loader` is not mistaken for
  `missing-context`.
- **Signature field** — present in `FIELD_ORDER` between `tags` and `confidence`; `validateEntry`
  accepts it as optional and validates against `SIGNATURE_PATTERN`; signature-less entries stay
  readable (Behavior 6).
- **Write path** — existing-wins on the update path with a stderr divergence warning (Behaviors 5b,
  5a); the new-entry path accepts the incoming signature. Both `finalEntry` literals name it.
- **Normalizers** — `normalizeFailureText` and `normalizeIdInput` are separate exports over one shared
  `deriveDigest`; separator preservation in `normalizeIdInput` is intact.
- **Inherited mode** — `parseBlockerId`'s `locationHash` is reused verbatim, producing
  `review-specs-<locationHash>` and hashing nothing. Matches `review-block-auto-retry.spec.md`
  Behavior 3's canonical `<reviewer-slug>:<finding-type>:<8-hex>` shape.
- **Migration** — prefix discriminator, ambiguity guard, `.validate.md` → `.spec.md` sibling mapping,
  read-time-only alias folding (`validate → validation`, `recover → recovery`, `learn → manual`), and
  byte-identical idempotency all conform.

Known defects, reported as suggestions per the standing repair queue:

- **CON-1** (suggestion, domain-model) — charter `FailureSignature.digest` (`charter.md:97`) omits the
  inherited-mode case. Queued defect (a).
- **CON-2** (suggestion, domain-model) — charter `EvidenceRef.source` enum (`charter.md:99`) does not
  match the live store's four spellings. The spec correctly handles the drift at read time only.
  Queued defect (b).
- **CON-3** (suggestion, contract) — `docs/cli-reference.md` has no entries for `adev heuristics
  signature` or `adev heuristics migrate-keys` (confirmed: zero matches). Queued defect (c),
  coordinated with `failure-capture.spec.md`.

## Spec vs Implementation

The implementation shipped across 12 commits (`68c71627..928375d2`); the five spec-named test files
run 152 tests, all passing. Divergences found, all warning-level and all in the direction of the code
being *more* complete than the revision-8 text:

| # | Spec says | Shipped code does | File |
|---|---|---|---|
| SA-2 | no dry-run mode | `--dry-run` flag exists on `migrate-keys` | `lib/cli/heuristics.mjs:824,837,1159` |
| SA-3 | no archive-conflict error row | exits 1 with `MIGRATION_ARCHIVE_CONFLICT` | `lib/cli/heuristics.mjs:904-917` |
| SA-4 | merge reconciles 3 fields | merge reconciles 7 | `lib/cli/heuristics.mjs:1024-1058` |
| SA-5 | merge stated unconditionally | merges only migration-created collisions | `lib/cli/heuristics.mjs:1127` |
| SA-6 | signature preserved in 3 cases | 4 cases; malformed stored value is discarded | `lib/heuristics.mjs:1015-1032` |

No behavior was found wrong or unimplementable as written. Nothing the spec requires is missing from
the code. Behaviors 1-7a, 8's discriminator, 9's contradiction-invariant re-application, and 10's
byte-identical idempotency are all implemented and directly tested.

Out-of-scope items correctly remain untouched, exactly as the spec's closing paragraph and Postcondition 1
scope them to `failure-capture.spec.md`: the dead `deriveId` twin (`lib/cli/heuristics.mjs:128`) still
holds a private absolute-path copy of the rule, and `skills/recover/SKILL.md:387` still carries the
prose ID Derivation Rule. These are deferrals, not divergences.

---

## Summary

**Total findings:** 13 (0 blockers, 6 warnings, 7 suggestions)

**Action required:** None blocking. The spec passes at revision 8, as it did in the round whose
artifact was destroyed. The six warnings are all "the revision-8 text lags the code that shipped from
it" — the right repair is a documentation-only revision 9 that adds `--dry-run`, the
`MIGRATION_ARCHIVE_CONFLICT` error row, the full per-field merge table, the migration-created-collision
qualifier, and the malformed-stored-signature case. None of them change behavior, none invalidate the
implementation, and none need to be resolved before `/adev:plan` (which has already run). SA-1 is
carried forward at its adjudicated warning severity.

**Governance footer:** `.context-index/governance/gates.yaml` defines a `spec-to-plan` transition;
`risk_level: high` sets `require_hitl_approval: true` in `risk-policies.yaml`. Informational only —
not blocking this verdict.
