---
date: 2026-05-15
spec: .context-index/specs/features/validation/validate-config-single-source.spec.md
charter: .context-index/specs/features/validation/charter.md
verdict: PASS_WITH_NOTES
last-reviewed-revision: 2
file-sha: 6e6af37972d3a85834511bc66d228b1590d6eac20953b150458af155f235e519
---

# Architecture Review: validate-config-single-source (rev 2)

> **Date:** 2026-05-15
> **Spec:** `.context-index/specs/features/validation/validate-config-single-source.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/validation/charter.md`
> **Verdict:** PASS_WITH_NOTES — both rev-1 blockers (SEC-1, CON-4) resolved; rev-1 warnings substantially addressed; new low-priority structural notes

## Rev-1 Disposition (was BLOCK)

**Blockers fully resolved:**
- **SEC-1** (id sanitization path traversal) → Behavior 0 enforces `^[a-z0-9][a-z0-9._-]*$` allowlist at parse time before URI construction; `INVALID_CHECK_ID` error code; truncated/stripped diagnostic; AC fixture required. Security reviewer verdict: PASS (no residual concerns).
- **CON-4** (loadValidateConfig signature claim wrong) → Invariant 5 and Behavior 2 corrected to acknowledge `loadValidateConfig(repoRoot, opts?)` with `pluginRoot` and `domainSeverityDefaults` keys preserved. Consistency reviewer verdict: PASS.

**Warnings substantially addressed:**
- **SA-1** (cross-charter ownership of `loadDomainConfig`): `coordinated-with: domain-profiles/charter.md` added; remaining gap is operational (who edits the constants file) — see new SA-8 below.
- **SA-2** (`kind: refactor` misleading) → reclassified to `kind: behavioral` + rev-2 prelude documents the one-time break. H1 title remains "Refactoring Spec:" (cosmetic, see new SA-2 below).
- **SA-3 / CON-1** (`supersedes-behaviors:` half-convention) → `superseded-by-behaviors:` added to `configurable-checks.spec.md` frontmatter; round-trip is symmetric and machine-readable; AC pins it.
- **CON-3** (Behavior 10 vs ADR-0003) → reworded with explicit "deliberate narrowing" language + Step 11 amends ADR-0003.
- **SEC-2** (domain arg validation) → Behavior 7a enforces at call time; `INVALID_DOMAIN_ARG` error code; AC fixture required.
- **SEC-3** (PROMPT_NOT_FOUND URI leakage) → Error Cases specifies truncation to ≤128 chars + allowlist strip; AC fixture required.
- **SEC-4** (hygiene drift sensitive paths) → Behavior 8 emits field-types-only for `prompt:` and `context_pack:` fields; AC fixture required.

**Suggestions addressed:**
- **SA-5** (migration tool partial overlay) → Step 8 now distinguishes absent / valid / malformed branches; Invariant rules out partial-overlay or escalates to Step 8a.
- **SA-6** (ADR-0003 amendment) → first-class Migration Path Step 11 + AC.
- **SA-7** (identical domain starters trap) → only software starter shipped; data-engineering/process-automation fall back via Behavior 4.
- **SEC-5** (corrupt-file behavior) → Step 8 refuses-rather-than-overwrites; `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG` error code.

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning (opus) | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable (sonnet) | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast (haiku) | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES — Most rev-1 findings resolved; 2 new findings (1 warning, 1 suggestion) plus carryovers on unaddressed suggestion-level items.

### SA-1 (carryover, partially-addressed) — warning — Cross-charter ownership of edit still ambiguous

**Finding:** `coordinated-with: domain-profiles/charter.md` documents the cross-charter interaction but doesn't resolve who owns the edit. Step 2 still describes the `loadDomainConfig` extension as work-in-this-spec, and three closed enumerations in `lib/domains/constants.mjs` (`DOMAIN_CONFIG_TYPES`, `DOMAIN_CONFIG_FILENAMES`, `STRUCTURED_CONFIG_TYPES`) all need entries for `'validate'`.
**Recommendation:** Either add a coordination note stating this spec contributes `validate` config-type entries to `lib/domains/constants.mjs` under explicit domain-profiles-charter approval (citing the approving artifact), or demote the loadDomainConfig extension to a follow-up issue filed against domain-profiles with a hard `depends-on:` (not just `coordinated-with:`).

### SA-2 (carryover, cosmetic only) — suggestion — H1 title still reads "Refactoring Spec:"

**Finding:** The `kind: behavioral` reclassification is clean at the field level, but the H1 title still says "Refactoring Spec: Single-Source Validate Configuration."
**Recommendation:** Rename H1 to "Behavioral Spec:" or add a parenthetical: "Single-Source Validate Configuration (behavioral; one-time break)." Low priority — the rev-2 prelude paragraph covers it for readers who land at the top.

### SA-4 (carryover, still open) — suggestion — Hygiene's missing-file behavior unstated

**Finding:** If a project's `governance/validate.yaml` is missing, `/adev:hygiene`'s drift audit (Step 7) would inherit validate's `MISSING_VALIDATE_CONFIG` throw by default. Hygiene should likely emit one INFO ("not yet scaffolded — run /adev:init") rather than crash.
**Recommendation:** Add a one-liner to Behavior 8 clarifying hygiene's missing-file branch.

### SA-5 (resolved with verification-timing nit) — suggestion — Partial-overlay invariant timing

**Finding:** The "No project today has a partial overlay" invariant is asserted but its verification timing is implicit ("Verified by grep/audit before migration tool ships").
**Recommendation:** Move the verification to an explicit planning-time prerequisite task (before Step 8 plans land) rather than a floating invariant.

### SA-8 (new) — warning — Constants file edits elided from Step 2

**Finding:** Step 2 says "Update `lib/domains/domain-config.mjs` to recognize `configType: 'validate'`," but the closed enumerations live in `lib/domains/constants.mjs` (`DOMAIN_CONFIG_TYPES`, `DOMAIN_CONFIG_FILENAMES`, `STRUCTURED_CONFIG_TYPES`). Adding `'validate'` requires three coordinated edits in another charter's module. Without naming the constants file, the planner may scope the change too narrowly.
**Recommendation:** Expand Step 2's "What" bullet to enumerate the three constants edits, or — preferred — fold this into SA-1's coordination-note remediation.

### SA-9 (new) — suggestion — Hygiene drift extends-resolution unstated

**Finding:** The Validate Config Drift audit "resolves the project's domain" and calls `loadDomainConfig`. For a custom domain that `extends` software (per domain-profiles charter), the starter resolved through extends may be software's, not the custom domain's overrides. The spec doesn't clarify whether the audit walks the `extends` chain or compares against the immediate domain only.
**Recommendation:** Clarify in Step 7 or Behavior 8: drift compares against the result of `loadDomainConfig(domain, 'validate', ...)` including extends resolution — i.e., whatever the next `/adev:init` would scaffold.

## Security Reviewer (security-reviewer)

**Verdict:** **PASS** — All 6 rev-1 findings resolved (including the SEC-1 blocker). One cosmetic naming inconsistency (now fixed: `MIGRATION_BLOCKED_BY_CORRUPT_CONFIG` aligned across body and Error Cases).

No new security findings introduced by rev-2 changes. All sensitive surfaces (id allowlist, domain arg validation, prompt URI truncation, hygiene field-types-only emission, migration-tool corrupt-file refusal) are now invariant-asserted with matching ACs.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** **PASS** — All 4 rev-1 findings resolved. Round-trip verified present on both sides of the supersession edge.

No new consistency findings introduced by rev-2 changes. Cross-charter coordination, ADR amendment, kind reclassification, and signature-correction all internally consistent.

## Summary

**Total findings:** 5 (0 blockers, 2 warnings, 3 suggestions — all from structural-architect; security and consistency returned PASS).

**Action required:** Status promotes to `review-passed`. Spec ready for `/adev:plan`. Worth addressing before planning lands:

- **SA-1 (warning, carryover)** — most consequential remaining gap. Either explicitly own the cross-charter edits or demote them to a follow-up dependency. The plan stage will need to know which option applies before tasks dispatch.
- **SA-8 (new warning)** — names the constants file that the planner would otherwise miss. Pairs naturally with SA-1's resolution.

Other findings (SA-2 H1, SA-4 hygiene missing-file, SA-5 verification timing, SA-9 extends-resolution) are suggestion-level cleanup; they can be addressed at plan or implementation time without blocking the spec.
