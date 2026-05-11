# Architecture Review: template-replacement

> **Date:** 2026-05-10
> **Spec:** .context-index/specs/features/domain-profiles/template-replacement.spec.md
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 2cf5d725eee577d7b3ff10cebb7410e64e7c0c0a

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

All 6 previous findings resolved:
- SA-1 (was blocker): RESOLVED — Cross-Spec Impact section lists all 3 sibling specs with exact update requirements and revision target.
- SA-2 (was warning): RESOLVED — Charter entity rename to DomainTemplate declared with AC tracking.
- SA-3 (was warning): RESOLVED — Behavior 7 emits OVERLAY_TYPE_DEPRECATED warning.
- SA-4 (was suggestion): RESOLVED — Step 1 includes automated migration test.
- SA-5 (was suggestion): RESOLVED — OVERLAY_TOO_LARGE now throws, matching resolution spec.
- SA-6 (was suggestion): RESOLVED — Step 3 addresses write-time template paths.

No new blockers or warnings. Two informational notes:

- **SA-7 (info):** Charter Capability Map "Template Replacement" status should update to `reviewed` after this review passes. Standard lifecycle bookkeeping.
- **SA-8 (info):** Charter Overlay File Structure capability description (line 90) still says "charter-overlay, spec-overlay" — will naturally be caught during the charter entity update.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

All 6 previous findings resolved (CA-1 through CA-6). Two new warnings, one informational:

- **CA-R1 (warning):** Charter update requirement (line 71) should explicitly include the Relationships section (line 66: "A DomainProfile contains exactly one TemplateOverlay (charter), one TemplateOverlay (spec)...") and Capability Map row descriptions (lines 91-92), not just the Entity table row. These also reference TemplateOverlay.

- **CA-R2 (warning):** Sibling specs are at `charter-revision: 3`. If the charter advances to revision 5 during the entity rename, sibling specs' `charter-revision` fields should also be bumped. The spec does not mention this.

- **CA-R3 (info):** Resolution spec Behavior 6 ("closed set" validation — unknown types return null immediately) needs deprecation-aware handling so old type names trigger OVERLAY_TYPE_DEPRECATED instead of being treated as unknown. The Cross-Spec Impact table should include this behavior in the resolution spec's required updates.

---

## Summary

**Total findings:** 5 (0 blockers, 2 warnings, 3 informational)

**Warnings:**
- CA-R1: Charter update scope should include Relationships section and Capability Map descriptions, not just Entity table
- CA-R2: Sibling spec charter-revision fields need bumping when charter advances

Review saved to `.context-index/specs/features/domain-profiles/template-replacement.review.md`.
Spec status updated to `review-passed`.

The spec is ready for planning. You can proceed to `/adev:plan` or address the warnings first.
