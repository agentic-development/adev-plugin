---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 2
file-sha: a27274f744bd1d31a3dbec2bd5c5b55c50d07396d79e8f6046fcbe595bba63fa
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` resolves the same)
> **Verdict:** BLOCK
> **Prior verdict:** BLOCK at revision 1 (6 blockers)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry source: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides applied. No registry warnings. Severity cap `blocker` for all three — nothing was clamped.

Heuristics injected: 3 module-scoped entries at `summary` tier (`adev heuristics retrieve --module heuristics`).

Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` frontmatter and no workspace was detected.

## Revision-1 blocker disposition

All six revision-1 blockers were independently re-checked against the revision-2 body. **All six are resolved.** The `revise --auto` run made no body edits, but the hand-authored fixes committed as `ddea5eb9` do close them:

| Prior blocker_id | Status | Evidence in revision 2 |
|---|---|---|
| `structural-architect:api-shape-conflict:25796bde` | RESOLVED | The "Two keys, two rules, one digest function" table plus Behaviors 3 and 7a separate origin (signature prefix) from caller-supplied `id` prefix; recover keeps `<category-slug>-<digest>` |
| `structural-architect:ambiguous-behavior:6c240478` | RESOLVED | Behaviors 2 and 7 define `normalizeFailureText` and `normalizeIdInput` as distinct normalizers; "exactly one implementation" is now asserted per-rule |
| `structural-architect:missing-precondition:bee2251f` | RESOLVED | Precondition 4 and the Error Cases row now agree: unresolvable root fails closed and the caller skips extraction |
| `structural-architect:circular-ownership:39f99256` | RESOLVED | Postcondition 1 is scoped to "every caller that this spec touches"; the repo-wide no-copy assertion is explicitly delegated to `failure-capture.spec.md` |
| `consistency-analyzer:contract:ee7e74a8` | RESOLVED | Behavior 3a derives the `review-specs` signature from `--blocker-id` via `parseBlockerId`, never re-hashing finding text |
| `consistency-analyzer:domain-model:8c5333d5` | RESOLVED | Behaviors 3a/3b give the charter's BLOCK-origin invariant an owning behavior, with `CONFLICTING_SIGNATURE_INPUT` guarding both directions |

The two new blockers below are **not** re-raises. They are newly surfaced concerns in territory the revision-1 review did not reach, with freshly computed `blocker_id`s.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

**Claim verification performed by the reviewer:** `parseBlockerId` confirmed at `lib/blocker-id.mjs:110`, returning an 8-hex `locationHash`. Cited line numbers confirmed accurate: `hooks/post-validate-extract-heuristics.mjs:123-124`, `lib/heuristics.mjs:185-199`. `writeHeuristic`'s whitelist construction confirmed at `lib/heuristics.mjs:687-780`.

### SA-1 — blocker

- **Location:** Behaviors 5 and 6; Postconditions ("`signature` round-trips through serialization"); Task Map row "Add `signature` to `FIELD_ORDER`"
- **blocker_id:** `structural-architect:incomplete-persistence-contract:d46375fd`
- **section_anchor:** `behaviors-5`
- **Finding:** Behavior 5 asserts that adding `signature` to `FIELD_ORDER` is what makes the field survive a round trip. That is not sufficient against the live write contract. `writeHeuristic` (`lib/heuristics.mjs:687-780`) constructs `finalEntry` from a fixed field whitelist on **both** the new-entry and update paths, so a caller-supplied `signature` never reaches `serializeHeuristic` at all. Independently confirmed by the aggregator: the update-path `finalEntry` literal enumerates `id`, `scope`, `title`, `pattern`, `confidence`, `evidence`, `contradictedBy`, `created`, `updated`, then conditionally `antiPattern` and `tags` — `signature` appears nowhere, and `validateEntry` (`lib/heuristics.mjs:101`) has no knowledge of the field. The spec therefore leaves the write-path contract unowned in three respects: (a) `writeHeuristic` accepting the field, (b) preserving it unchanged on the update path — the charter invariant "a `signature` is never rewritten once assigned" has no owning behavior anywhere in this spec, and (c) `validateEntry` treating it as legal. Both sibling specs declare this as a precondition *on this spec*: `failure-capture.spec.md:44` ("`writeHeuristic` accepts a `signature` field") and `signature-retrieval.spec.md:39`.
- **Recommendation:** Add a behavior covering the write-path contract for `signature`: accepted on write, persisted, preserved unchanged when an existing entry is updated, and absent-safe. Restate Behavior 5's mechanism claim so it does not assert that `FIELD_ORDER` alone is sufficient.

### SA-2 — blocker

- **Location:** Behavior 8 (`migrate-keys`), interacting with Behavior 7a
- **blocker_id:** `structural-architect:missing-input-contract:ff941c2c`
- **section_anchor:** `behaviors-8`
- **Finding:** `migrate-keys` has no defined input contract. It recomputes `id` "for every stored entry whose evidence permits recomputation" but never states (a) the discriminator that selects an entry as in-scope, or (b) where the recomputation reads its hash inputs from. The live store mixes three id families: hand-authored ids with no digest (`.context-index/memory/heuristics/_global.md` — `eval-with-session-jsonl`, `cache-reads-dominate-cost`), validate-derived `<spec-slug>-<8hex>` ids, and recover-derived `<category-slug>-<8hex>` ids. Only the second family is recomputable under Behavior 7's rule, and Behavior 7a makes recover ids' byte-identity a load-bearing property that `failure-capture.spec.md` Behavior 6 depends on — so misclassification here silently breaks a sibling spec's contract. Separately, Behavior 7's hash input needs the repo-relative **spec path**, which stored entries do not carry (evidence rows hold a `.validate.md` report path); the spec does not say that the spec path is reconstructed from evidence, or that entries lacking one are left untouched.
- **Recommendation:** Specify the in-scope discriminator explicitly (which id families are rekeyed, which are left untouched and counted as such), and specify what the recomputation reads for each in-scope entry. State that recover-derived and hand-authored ids are out of scope for rekeying.

### SA-3 — warning

- **Location:** Behaviors 8 and 9; Acceptance Criteria ("preserves evidence, confidence, and contradiction history")
- **Finding:** Behavior 8 says migration preserves `confidence` unchanged and Behavior 9 says a merge keeps "the higher confidence". Both conflict with the charter's absolute-threshold promotion invariant and with `autoPromote` (`lib/heuristics.mjs:647`), which raises confidence whenever merged evidence reaches 2 or 3 distinct `path` values. A Behavior 9 merge unions evidence arrays and will routinely cross that threshold, leaving the stated migration outcome and the charter invariant in disagreement. Behavior 8 also omits `updated` from its preservation list without saying whether it is refreshed — while Behavior 10 demands byte-identity on a second run.
- **Recommendation:** State explicitly whether post-merge confidence is subject to the promotion rule or frozen at the higher of the two, and settle the `updated` field's treatment.

### SA-4 — warning

- **Location:** Error Cases table, rows 2 and 3
- **Finding:** Error precedence is undefined for `--origin review-specs` with neither `--text` nor `--blocker-id`. Row 2 (`--text` missing → `EMPTY_SIGNATURE_TEXT`) and row 3 (`review-specs` without `--blocker-id` → `CONFLICTING_SIGNATURE_INPUT`) both match, and an acceptance criterion asserts the latter. Callers keyed on the error code cannot rely on either.
- **Recommendation:** Define the validation order (origin legality → origin-specific input requirement → emptiness) so exactly one code is reachable per input shape.

### SA-5 — warning

- **Location:** Actionable Task Map / System Constitution Reference
- **Finding:** The spec introduces two new public CLI verbs (`heuristics signature`, `heuristics migrate-keys`) but has no task or acceptance criterion covering `docs/cli-reference.md`, which the constitution names as the reference for all CLI verbs by audience. The sibling `failure-capture.spec.md:77` explicitly handles the *removal*-side doc update for `extract`, so the omission here is asymmetric rather than delegated.
- **Recommendation:** Add the reference-doc update to this spec's task map, or state explicitly which spec owns documenting the new verbs.

### SA-6 — suggestion

- **Location:** Behavior 1 vs Behavior 3a
- **Finding:** Behavior 1 is written unconditionally ("with a legal origin … where `<digest>` is the SHA-256 of the text after `normalizeFailureText`"), which Behavior 3a then contradicts for `review-specs`. The `review-specs` digest also inherits `blocker_id`'s hash input (`<section-anchor>:<truncated-finding-text>`), which is not `normalizeFailureText` output.
- **Recommendation:** Scope Behavior 1 to the text-derived origins and cross-reference 3a as the exception.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**Threat model applied:** local dev CLI plus a git-tracked, team-shared markdown store in a single repository. No auth/authz boundary — all operators already have full repo write access. No network surface.

Revision 2's new `--blocker-id` path is well-formed from a security standpoint: `parseBlockerId` already enforces `[a-z0-9-]+` on components and `^[0-9a-f]{8}$` on the hash segment, both inputs fail closed (`INVALID_BLOCKER_ID`, `CONFLICTING_SIGNATURE_INPUT`), and no error message echoes uncontrolled data. No new security issues introduced by the revision.

### SEC-1 — suggestion (input-validation)

- **Finding:** Carried forward from revision 1 and **downgraded from warning**. `signature` still has no format check in `validateEntry()`; only `id` gets a `SAFE_SLUG_PATTERN` backstop (`lib/heuristics.mjs:124`). Every sanctioned write path (Behaviors 1 and 3a) produces values matching `^(recover|validate|review-specs|implement)-[0-9a-f]{8}$` by construction, and under this threat model a schema check would not close a privilege-escalation path — a hand-edit could inject equally through `pattern`/`title`.
- **Recommendation:** For consistency with the existing `id` treatment, and to catch corrupted or hand-authored entries before they enter the exact-match auto-inject path of `signature-retrieval.spec.md` Behavior 2, add the same format assertion to `validateEntry()`. Treat it as a data-integrity guard, not a trust-boundary control.

### SEC-2 — suggestion (secrets)

- **Finding:** Unaddressed from revision 1. `--origin <slug> --text <text>` (Behavior 1) still takes failure text — which the caller sources from captured stderr per the charter — as a bare argv value for the `recover`, `validate`, and `implement` origins. On a shared local machine this is visible via `ps aux` and persists in shell history.
- **Recommendation:** Accept `--text -` (or auto-detect non-TTY stdin) as an alternative to the argv form, and have the callers in `failure-capture.spec.md` pipe captured text. The `review-specs` origin is now exempt via 3a, which reduces but does not eliminate the exposure.

### SEC-3 — suggestion (input-validation)

- **Finding:** Unaddressed from revision 1. Behavior 3 still says the rejected `--origin` value is "truncated before it is echoed" with no pinned length, so the `INVALID_SIGNATURE_ORIGIN` error contract is untestable and can regress silently.
- **Recommendation:** Pin a concrete constant (e.g. reuse the 200-char pattern established by `BLOCKER_FINDING_TEXT_TRUNCATE` in `lib/blocker-id.mjs`, or a smaller value appropriate to a single CLI flag such as 80) and state it in Behavior 3.

**Explicitly not flagged:** origin allowlist enforcement and ANSI/control-char stripping (correctly specified); atomic temp-then-rename writes, migration rollback-on-read-failure, and idempotent re-runs; no shell execution and no path-traversal surface; raw `--text` is never persisted — only its 8-hex digest survives into `signature`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Revision 2 closes both prior blockers. Cross-cutting compliance verified: `review-block-auto-retry.spec.md` Behavior 3 and the `lib/blocker-id.mjs` format (`<reviewer>:<type>:<8-hex>`) are respected — `INVALID_BLOCKER_ID` error code, 8-lowercase-hex digest length, and determinism all match. No conflict with `check-id-enum.spec.md`.

### CON-1 — warning (contract)

- **This spec:** Behavior 3a says the verb "parses it via `parseBlockerId` … and reuses its existing hash component". Verified against `lib/blocker-id.mjs`: `parseBlockerId` returns `{ reviewer, type, locationHash }`.
- **Conflicts with:** `charter.md` § Interface Contracts § Consumed APIs, which lists the consumed interface as `buildBlockerId({ reviewer, type, sectionAnchor, findingText })` — the constructor, not the parser this spec actually depends on.
- **Recommendation:** Charter-side fix. Change the Consumed APIs row to `parseBlockerId(blockerId)` (or list both), since `buildBlockerId` is invoked upstream by reviewer subagents per `review-block-auto-retry.spec.md` Behavior 3, not by this spec.

### CON-2 — warning (contract)

- **This spec:** Adds `--blocker-id` and the mutual-exclusivity rule with `--text` (Behaviors 3a/3b).
- **Conflicts with:** `charter.md` § Interface Contracts § Exposed APIs, row `adev heuristics signature --origin <slug> --text <text>`, which documents only the `--text` path.
- **Recommendation:** Charter-side fix. Update the row to reflect the two-input verb signature. Documentation-completeness gap, not a runtime mismatch — the charter's Phase 3 In Scope prose already anticipates the `blocker_id` path.

### CON-3 — suggestion (domain-model)

- **This spec:** Behavior 3a's `review-specs` digest is the reused `locationHash` from `blocker_id` (hashed over `<sectionAnchor>:<truncatedFindingText>`), not a hash of `normalizeFailureText` output.
- **Conflicts with:** `charter.md` § Domain Model § Entities, where `FailureSignature.digest` is stated unconditionally as "SHA-256 prefix over the normalized failure text", without the `review-specs` carve-out the charter's own Phase 3 prose describes.
- **Recommendation:** Charter-side. Note the exception inline on the entity row.

### CON-4 — suggestion (terminology)

- **This spec:** Behavior 2 traces `normalizeFailureText` to `skills/recover/SKILL.md:393` rather than giving the normalizer's own canonical definition location. Carried from revision 1, informational only; not re-escalated.

---

## Advisories

- No `LEGACY_REVIEWER_OUTPUT` advisories: both `blocker` findings carried a well-formed `blocker_id`.
- No `INVALID_BLOCKER_ID` advisories: both ids parse cleanly via `lib/blocker-id.mjs::parseBlockerId` (verified by the aggregator, not asserted).
- No `MISSING_SECTION_ANCHOR` advisories: both blockers carried a lowercase-kebab `section_anchor` (`behaviors-5`, `behaviors-8`).
- No `BLOCKER_ID_COLLISION` advisories: the two ids are distinct.
- No `SECTION_ANCHOR_NORMALIZED` advisories this round (unlike revision 1).
- Severity cap (`blocker` for all three reviewers) demoted nothing.
- **Convergence note:** the revision-2 blocker set is disjoint from the revision-1 set. Zero of the six prior blocker_ids recur; both current blocker_ids are new. This is forward progress, not a stall.

## Governance Footer

`.context-index/governance/gates.yaml` defines no `approver_role` on a `spec-to-plan` transition, so no human approver is named for this transition. Note that `risk-policies.yaml` sets `require_hitl_approval: true` for `risk_level: high` — this spec is `high`, so human sign-off is expected before implementation regardless of the review verdict.

---

## Summary

**Total findings:** 13 (2 blockers, 5 warnings, 6 suggestions)

**Blockers:**

| ID | blocker_id | Section | Theme |
|----|-----------|---------|-------|
| SA-1 | `structural-architect:incomplete-persistence-contract:d46375fd` | `behaviors-5` | `signature` write-path contract is unowned — `writeHeuristic`'s field whitelist drops it before serialization, and both siblings declare that acceptance as a precondition on this spec |
| SA-2 | `structural-architect:missing-input-contract:ff941c2c` | `behaviors-8` | `migrate-keys` has no in-scope discriminator and no stated source for its recomputation inputs; misclassifying recover-derived ids would break `failure-capture.spec.md` Behavior 6 |

**Action required:** BLOCK. Run `/adev:specify --revise --spec .context-index/specs/features/heuristics/failure-signature-key.spec.md` to address the two blockers listed in `failure-signature-key.blockers.md`, then re-run `/adev:review-specs` on revision 3. Planning cannot begin until the verdict is PASS or PASS_WITH_NOTES.

Both sibling Phase-3 specs (`failure-capture.spec.md`, `signature-retrieval.spec.md`) declare a precondition that this spec ships first, so they remain transitively blocked. CON-1, CON-2, and CON-3 are charter-side edits, not spec-side — they can be folded into a charter revision 7 independently of the revise loop.
