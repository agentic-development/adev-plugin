---
kind: review
spec: .context-index/specs/features/heuristics/failure-signature-key.spec.md
charter: .context-index/specs/features/heuristics/charter.md
verdict: BLOCK
rigor-tier: full
reviewed: 2026-08-15
last-reviewed-revision: 3
file-sha: 1a5c5575e77aceaa6c05f6d82120327165a08b833cddaaf3b535a73907e87b6a
---

# Architecture Review: failure-signature-key

> **Date:** 2026-08-15
> **Spec:** `.context-index/specs/features/heuristics/failure-signature-key.spec.md` (revision 3)
> **Charter:** `.context-index/specs/features/heuristics/charter.md` (revision 6, Phase 3)
> **Rigor tier:** full (explicit `--tier full`; `risk_level: high` → `review_mode: full` resolves the same)
> **Verdict:** BLOCK
> **Prior verdicts:** BLOCK at revision 1 (6 blockers), BLOCK at revision 2 (2 blockers)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

Registry source: domain `software` (source level `default`); `.context-index/governance/review.yaml` declares `reviewers: []`, so no overrides applied. No registry warnings. Severity cap `blocker` for all three — nothing was clamped.

Heuristics injected: 3 module-scoped entries at `summary` tier (`adev heuristics retrieve --module heuristics`).

Cross-repo `depends-on` validation: skipped — the spec declares no `depends-on` frontmatter and no workspace was detected.

## Revision-2 blocker disposition

Both revision-2 blockers were independently re-checked against the revision-3 body by the reviewer that raised them. **Both are resolved.**

| Prior blocker_id | Status | Evidence in revision 3 |
|---|---|---|
| `structural-architect:incomplete-persistence-contract:d46375fd` | RESOLVED | Behavior 5 now names all three write-path gates — `validateEntry` accepts and validates the field, both `finalEntry` literals (`:733` update, `:767` new) carry it, `FIELD_ORDER` emits it. Behavior 5a owns preserve-on-omit. The Task Map row matches, and the Acceptance Criteria assert round-trip separately on the new-entry and update paths |
| `structural-architect:missing-input-contract:ff941c2c` | RESOLVED | Behavior 8 now states a positive in-scope discriminator (`evidence[].source === "validation"`), an explicit never-rekey set tied to `failure-capture.spec.md` Behavior 6, the two recomputation inputs (evidence `path` + stored `pattern`, matching Behavior 7), and skip-rather-than-guess with a distinct skipped-unrecoverable count |

The single new blocker below is **not** a re-raise. It concerns the *conflicting-value* case on the update path, which Behavior 5a does not reach, and carries a freshly computed `blocker_id`.

**Convergence:** the revision-3 blocker set is disjoint from the revision-2 set (`{d46375fd, ff941c2c}` ∩ `{5c58f7d8}` = ∅), and also disjoint from the revision-1 set. Blocker count is falling monotonically: 6 → 2 → 1.

## Structural Architect (structural-architect)

**Verdict:** BLOCK

**Claim verification performed by the reviewer and re-confirmed by the aggregator:** all of revision 3's line-number and code-shape claims check out. `validateEntry` at `lib/heuristics.mjs:101` with no `signature` handling; the two `finalEntry` object literals at `:733` (update) and `:767` (new entry), both fixed whitelists naming `id`, `scope`, `title`, `pattern`, `confidence`, `evidence`, `contradictedBy`, `created`, `updated` plus conditional `antiPattern`/`tags`; `FIELD_ORDER` at `:185-199` with `signature` absent. `parseBlockerId` at `lib/blocker-id.mjs:110` returns an 8-lowercase-hex `locationHash`. The hook's `hashInput` at `hooks/post-validate-extract-heuristics.mjs:123-124` is `${normalizePath(specPath)}|${pattern}` over the absolute path and writes `evidence[].source === 'validation'` at `:132`; 24 live entries under `.context-index/memory/heuristics/` carry that value, so Behavior 8's discriminator is grounded in the real corpus.

### SA-1 — blocker

- **Location:** Behavior 5b (and 5a)
- **blocker_id:** `structural-architect:charter-invariant-conflict:5c58f7d8`
- **section_anchor:** `behaviors-5`
- **Finding:** Behavior 5b specifies that `signature` "follows the same incoming-wins-then-preserve-existing rule already used for `antiPattern` and `tags`." Incoming-wins means an incoming entry carrying a *different* `signature` overwrites the stored one. The charter's Domain Model → Invariants states unconditionally: "A `signature` is never rewritten once assigned." Behavior 5a covers only the omit case, so the conflicting-value case is specified in direct contradiction to the invariant. This is reachable, not theoretical: `id` is keyed on `<spec-path>|<pattern>` while `signature` is keyed on failure text, so two failures that yield the same derived `pattern` but different failure text land on the same `id` with different signatures — and the identity the downstream batch breaker counts on silently changes under an ordinary update.
- **Recommendation:** State the write-path rule for `signature` explicitly and differently from `antiPattern`/`tags` — existing-wins: once an entry has a `signature`, an update never replaces it (an incoming differing value is ignored, optionally surfaced as a warning); a `signature` is written only when the stored entry has none. Add a matching acceptance criterion.

### SA-2 — warning

- **Location:** Behavior 8, "Out of scope, never rekeyed"
- **Finding:** The evidence-`source` vocabulary is drifted and unowned, and the enumeration is not exhaustive over the live corpus. `_global.md` contains 4 entries with `source: learn`; `_format.md` (an Exposed API in the charter) describes `source` as an open field with examples `recover` / `validate` — singular, unlike the `validation` the hook writes and the `recovery` the charter's EvidenceRef entity lists. A `learn`-sourced entry is neither in-scope nor in the enumerated out-of-scope set, so it falls outside all four reported counts, and a future `_format.md`-conforming writer using `validate` would carry a path-dependent `id` past the migration with no operator signal.
- **Recommendation:** Make the out-of-scope clause the complement ("every entry with no `validation`-sourced evidence element") rather than an enumeration, so the partition is total, and have the summary count it. Reconciling the three `source` spellings is charter/`_format.md` work, not this spec's, but the spec should not depend on an enumeration the live store already violates.

### SA-3 — warning

- **Location:** Postconditions, bullet 3
- **Finding:** "Every entry in the store has a location-independent `id`" is stated unconditionally, but Behavior 8 explicitly permits entries to retain their original `id` (skipped-unrecoverable, and manual entries with no derivable input). A validation step reading the postconditions literally would fail a store that Behavior 8 says is correct.
- **Recommendation:** Scope it to in-scope entries: "every entry the migration rekeys has a location-independent `id`; skipped entries are reported by count and reason."

### SA-4 — warning

- **Location:** Behavior 9
- **Finding:** The merge keeps the higher confidence and unions `contradicted-by[]`, with no reconciliation against the charter invariant "A Heuristic with two or more `contradicted-by` entries cannot remain at `high` confidence." A merge can therefore produce an entry that violates it. Risk is currently theoretical (no live entry has contradictions), which is why this is not a blocker.
- **Recommendation:** State that the merged entry is re-evaluated against the confidence invariants after the union, or that a merge whose result would violate them is reported and left for `/adev:retro`.

### SA-5 — suggestion

- **Location:** Behavior 8, "In scope"
- **Finding:** "At least one `validation` evidence element" would rekey a recover-origin entry that later accumulated validation evidence — the exact byte-identity `failure-capture.spec.md` Behavior 6 protects. Prefix disjointness (`<category-slug>-` vs `<spec-slug>-`) makes this very unlikely, so it does not need a behavior, but a one-line note that the never-rekey rule wins on a mixed-source entry would close the reading.

**ADR compliance:** no conflicts. ADR-0016 (adev-owned state is canonical, harness-neutral) and ADR-0005 (workspace isolation) both point the same direction as the location-independent `id`; ADR-0014's stderr policy governs `adev issues migrate` only and imposes nothing on `migrate-keys` reporting.

Carried forward, unresolved from revision 2 and not re-escalated: SA-3/rev2 (post-merge confidence versus `autoPromote`; the `updated` field's treatment against Behavior 10's byte-identity demand), SA-4/rev2 (error precedence for `--origin review-specs` with neither `--text` nor `--blocker-id`), SA-5/rev2 (`docs/cli-reference.md` coverage for the two new verbs), SA-6/rev2 (Behavior 1 written unconditionally against Behavior 3a's exception).

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

**Threat model applied (unchanged):** local dev CLI plus a git-tracked, team-shared markdown store in a single repository. No auth/authz boundary — all operators already have full repo write access. No network surface.

Revision 3's changed territory (Behaviors 5/5a write path, Behavior 8's discriminator) was reviewed for security implications specifically. `migrate-keys` reads only stored `evidence[].path` and the entry's own `pattern` — no new external input surface, and the "unrecoverable input" branch fails closed rather than guessing, so no path-traversal surface is introduced. Behavior 9's merge is a data-integrity concern (already covered by SA-4), not a security one. No new security findings.

### SEC-1 — closed (input-validation)

- **Finding:** **Resolved in revision 3.** Behavior 5(a) now states that `validateEntry` accepts `signature` as an optional field and rejects a malformed one — a string matching `[a-z0-9][a-z0-9-]*`, max 64 characters. Verified against the live `SAFE_SLUG_PATTERN` (`lib/heuristics.mjs:54`, `/^[_a-z0-9][_a-z0-9-]{0,63}$/`) and `FIELD_LENGTH_CAPS` (`:69-73`): the proposed rule is consistent with the existing `id`/`scope` validation convention. This closes the data-integrity gap ahead of the exact-match auto-inject path in `signature-retrieval.spec.md` Behavior 2.

### SEC-2 — suggestion (secrets)

- **Finding:** Unaddressed, unchanged from revision 2. Behavior 1's `--origin <slug> --text <text>` still passes failure text as a bare argv value for the `recover`, `validate`, and `implement` origins, visible via `ps aux` and persisted in shell history. The `review-specs` origin is exempt via 3a, which reduces but does not eliminate the exposure.
- **Recommendation:** Accept `--text -` (or auto-detect non-TTY stdin) as an alternative to the argv form, and have the callers in `failure-capture.spec.md` pipe captured text. Worth closing before the sibling specs wire up their callers.

### SEC-3 — suggestion (input-validation)

- **Finding:** Unaddressed, unchanged from revision 2. Behavior 3 still says the rejected `--origin` value is "truncated before it is echoed" with no pinned length, so the `INVALID_SIGNATURE_ORIGIN` error contract is untestable and can regress silently.
- **Recommendation:** Pin a concrete constant — reuse the 200-char `BLOCKER_FINDING_TEXT_TRUNCATE` precedent at `lib/blocker-id.mjs:26`, or a smaller value appropriate to a single CLI flag such as 80 — and state it in Behavior 3.

**Explicitly not flagged:** origin allowlist enforcement and ANSI/control-char stripping (correctly specified); atomic temp-then-rename writes, migration rollback-on-read-failure, idempotent re-runs; no shell execution and no path-traversal surface; raw `--text` is never persisted — only its 8-hex digest survives into `signature`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No new blockers, warnings, or naming/pattern violations detected in revision 3. Both prior structural blockers were independently confirmed resolved from the consistency side.

Verified alignments:

- Behavior 5a (preserve-on-omit) is consistent with the charter invariant "A `signature` is never rewritten once assigned" *for the omit case*. (The conflicting-value case is SA-1's blocker above; the consistency reviewer did not reach it.)
- Behavior 8's preservation list includes `signature`, maintaining both that invariant and the sibling precondition that the round trip survives (`signature-retrieval.spec.md:39-40`).
- The origin enum (`recover`, `validate`, `review-specs`, `implement`) matches the charter's Exposed API row exactly.
- Behavior 3a's use of `parseBlockerId` respects the `blocker_id` format defined by `review-block-auto-retry.spec.md` Behavior 3 (`<reviewer>:<type>:<8-hex>`, deterministic).
- No new error codes collide with existing ones; all are scoped to the signature primitive.
- Constitution compliance: Node built-ins only (`node:crypto`), no inline-Node in skill prose, logic lives in the CLI verb.

### CON-1 / CON-2 / CON-3 — suggestions (carried forward, charter-side)

Unchanged from revision 2 and still open, but they are charter documentation lag rather than spec defects and are explicitly not re-escalated: the Consumed APIs row names `buildBlockerId(...)` where this spec depends on `parseBlockerId`; the Exposed APIs row documents only the `--text` path, not the two-input signature; and `FailureSignature.digest` is stated unconditionally without the `review-specs` carve-out that the charter's own Phase 3 prose describes. All three should be folded into a charter revision 7 independently of this revise loop.

### CON-4 — suggestion (terminology)

Behavior 2 still traces `normalizeFailureText` to `skills/recover/SKILL.md:393` rather than giving the normalizer's own canonical definition location. Informational; not re-escalated.

---

## Advisories

- No `LEGACY_REVIEWER_OUTPUT` advisories: the single `blocker` finding carried a well-formed `blocker_id`.
- No `INVALID_BLOCKER_ID` advisories: `structural-architect:charter-invariant-conflict:5c58f7d8` parses cleanly via `lib/blocker-id.mjs::parseBlockerId` (verified by the aggregator, not asserted) → `{ reviewer: "structural-architect", type: "charter-invariant-conflict", locationHash: "5c58f7d8" }`.
- No `MISSING_SECTION_ANCHOR` advisories: the blocker carried a lowercase-kebab `section_anchor` (`behaviors-5`).
- No `BLOCKER_ID_COLLISION` advisories: a single blocker entry.
- No `SECTION_ANCHOR_NORMALIZED` advisories this round.
- Severity cap (`blocker` for all three reviewers) demoted nothing.
- **Convergence note:** the revision-3 blocker set `{structural-architect:charter-invariant-conflict:5c58f7d8}` is disjoint from both prior sets. Zero prior blocker_ids recur. Blocker count falls 6 → 2 → 1. This is forward progress, not a stall — but the auto-retry budget is exhausted, so resolution is now a human-driven step.

## Governance Footer

`.context-index/governance/gates.yaml` defines no `approver_role` on a `spec-to-plan` transition (the block is commented out), so no human approver is named for this transition. Note that `risk-policies.yaml` sets `require_hitl_approval: true` for `risk_level: high` — this spec is `high`, so human sign-off is expected before implementation regardless of the review verdict.

---

## Summary

**Total findings:** 11 (1 blocker, 3 warnings, 7 suggestions)

**Blockers:**

| ID | blocker_id | Section | Theme |
|----|-----------|---------|-------|
| SA-1 | `structural-architect:charter-invariant-conflict:5c58f7d8` | `behaviors-5` | Behavior 5b's incoming-wins rule for `signature` contradicts the charter invariant "a `signature` is never rewritten once assigned"; Behavior 5a covers only the omit case, leaving the conflicting-value case specified against the invariant |

**Action required:** BLOCK. The fix is narrow and local to Behavior 5b: replace incoming-wins with existing-wins for `signature` (an update never replaces an assigned signature; it is written only when the stored entry has none), plus a matching acceptance criterion. The three warnings (SA-2 out-of-scope enumeration is not total over the live corpus; SA-3 unconditional postcondition versus permitted skips; SA-4 post-merge confidence invariant) are worth folding into the same edit but do not block on their own.

Both sibling Phase-3 specs (`failure-capture.spec.md`, `signature-retrieval.spec.md`) declare a precondition that this spec ships first, so they remain transitively blocked. CON-1, CON-2, and CON-3 are charter-side edits that can land independently as charter revision 7.
