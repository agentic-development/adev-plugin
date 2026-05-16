---
date: 2026-05-15
spec: .context-index/specs/features/validation/check-set-restructure.spec.md
charter: .context-index/specs/features/validation/charter.md
verdict: PASS_WITH_NOTES
last-reviewed-revision: 2
file-sha: b685d2ef5b2e26ace788b168d56a4e41543ebffa09ec46b9cba510b2cba8d944
---

# Architecture Review: check-set-restructure (rev 2)

> **Date:** 2026-05-15
> **Spec:** `.context-index/specs/features/validation/check-set-restructure.spec.md` (revision 2)
> **Charter:** `.context-index/specs/features/validation/charter.md`
> **Verdict:** PASS_WITH_NOTES — all rev-1 findings resolved; new low-priority suggestions only

## Rev-1 Disposition

All 10 rev-1 findings (0 blockers, 6 warnings, 4 suggestions) addressed in rev 2:
- **SA-1** (cross-charter coupling): `coordinated-with:` frontmatter + Step 1 coordination notes
- **SA-2** (scope-expansion contract): pinned to `source-manifest.files` in Behavior 3 + Step 5
- **SA-3** (removed-ID rule split): consolidated in Behavior 11 ("project edits warn; plugin remnants hard-fail")
- **SA-4** (dependency ordering): hard ordering declaration at Migration Path preamble
- **SA-5** (post-validate hook charter scope): acknowledged with follow-up issue
- **SA-6** (reportPlanTask AC): new AC referencing authoritative channel from plan-task-events.spec.md
- **CON-1** (line 30 count): corrected to "12 entries: Checks 1.5 and 2-12"
- **SEC-1** (heuristic hook input scoping): metadata-only contract specified in ADDED + AC

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning (opus) | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable (sonnet) | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast (haiku) | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES — All 4 warnings + 2 suggestions from rev 1 confirmed resolved. 3 new suggestion-level findings.

### SA-7 (new) — suggestion — Behavior 11 example list could disambiguate two `check-12` registry IDs

**Finding:** Rev-2 Behavior 11 lists `check-12-lifecycle-reconciliation` and `check-12-heuristic-extraction` as distinct removed IDs both numbered "12." This is correct (the legacy registry never had a Check 13 ID) but a reader trying to map back to today's defaults.yaml may stumble.
**Recommendation:** One-line clarification in Behavior 11 or REMOVED list confirming the two pre-restructure IDs are distinct full IDs despite sharing the "check-12" prefix.

### SA-8 (new) — suggestion — Ordering declaration lacks lifecycle-machine-checkable gate

**Finding:** The rev-2 hard ordering pin commits to landing after `validate-config-single-source.spec.md`, but no AC or lifecycle gate prevents this spec from entering `/adev:plan` while the sibling is still in review. The fallback paragraph is informal guidance.
**Recommendation:** Add an AC asserting "plan stage may not dispatch until sibling reaches `status: validated` (or at minimum `status: review-passed`)" — making the dependency lifecycle-machine-checkable.

### SA-9 (new) — suggestion — `reportPlanTask` AC narrows to plan-task slice only

**Finding:** SA-6's AC requires `/adev:reconcile --fix` to write through `reportPlanTask` events. But Check 12 covered four sub-concerns (issue/epic, spec-status, charter capability, plan-checkbox). `reportPlanTask` is authoritative only for the plan-task slice.
**Recommendation:** Tighten AC: "for the plan-task-state slice, `/adev:reconcile --fix` writes through `reportPlanTask`; for the issue/epic/charter sub-slices, the reconcile skill writes through their respective authoritative channels."

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES — rev-1 SEC-1 (heuristic hook input scoping) resolved. 3 new low-severity findings.

### SEC-2 (new) — low — Hook failure mode leaves no audit trail

**Finding:** `HEURISTIC_HOOK_FAILED` requires only "WARN logged to console." Partial writes to the heuristic store could silently corrupt without record of which validate run caused it.
**Recommendation:** Specify atomic write semantics (write-to-temp then rename), or accept eventual-consistency and include the spec path in the failure log so the heuristic store can be manually reconciled.

### SEC-3 (new) — low — Check 2 unbounded diff on no-prior-commit fallback

**Finding:** When no plan exists, Check 2's scope-expansion derives "implementation files" from the diff against the last validated commit. The spec does not specify behavior when no prior validated commit exists (new spec's first validate run) — the diff could be unbounded.
**Recommendation:** Pin the no-prior-commit fallback explicitly: emit the INFO "scope verification unavailable — no prior validated commit" (analogous to the no-`source-manifest.files` case), or scope the diff to plan's task list only. Add an AC fixture for this branch.

### SEC-4 (new) — low — RESURRECTED_CHECK_ID message verbosity

**Finding:** The WARN message for `RESURRECTED_CHECK_ID` should be minimal (id only) to avoid leaking internal refactor history into validate reports that may be shared.
**Recommendation:** Scope WARN message to "Check '<id>' was removed in this plugin version; the entry is skipped." No additional rationale or migration advice.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES — rev-1 CON-1 resolved. 3 new suggestions on edge cases.

### CON-2 (new) — suggestion — `coordinated-with:` lacks documented definition

**Finding:** New frontmatter field `coordinated-with:` (introduced as part of SA-1 fix) is well-used but not defined in spec templates or constitution. Semantics are slightly weaker than `depends-on:`.
**Recommendation:** Add a one-line definition to the next spec-template guidance. Not blocking — usage is clear enough to proceed.

### CON-3 (new) — suggestion — `source-manifest.files: []` edge case unspecified

**Finding:** Behavior 3 distinguishes "absent `source-manifest.files`" (INFO note) from "present `source-manifest.files`" (scope-expansion check). But the spec does not say what happens for `source-manifest.files: []` (present but empty).
**Recommendation:** Clarify during implementation: empty list means "verified empty" (PASS, no finding), not "unavailable" (INFO). Pin in Check 2 prompt.

### CON-4 (new) — suggestion — "Implementation files" source ambiguity

**Finding:** Behavior 3 says scope-expansion compares against "implementation files" but doesn't specify the source (plan's file list? diff? both?). SEC-3 raises the same concern from a security angle.
**Recommendation:** Pin in Check 2 prompt: "Implementation files = plan's file list if a plan exists, else diff against last-validated commit; falls back to INFO if neither available."

## Summary

**Total findings:** 9 (0 blockers, 0 warnings, 9 suggestions — all new low-priority findings from rev-2 changes; all rev-1 findings resolved).

**Action required:** Status promotes to `review-passed`. Spec ready for `/adev:plan`. The 9 suggestions are advisory and can be addressed at plan time or during implementation:
- SA-7, CON-2: documentation/clarity polish.
- SA-8: lifecycle gating — worth adding the AC if the user wants machine-checkable ordering enforcement.
- SA-9: AC scope-narrowing for `reportPlanTask` (precision improvement).
- SEC-2, SEC-3, SEC-4: low-severity hardening for hook failure, no-prior-commit fallback, and WARN message minimization.
- CON-3, CON-4: edge-case prompt details for Check 2 implementation.

None of these block planning. The spec successfully closed every rev-1 finding.
