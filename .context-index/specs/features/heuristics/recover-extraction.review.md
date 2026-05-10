# Architecture Review: recover-extraction (r3 — targeted re-review)

> **Date:** 2026-04-09
> **Spec:** .context-index/specs/features/heuristics/recover-extraction.spec.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 896174c91b921bc349b0ce7eeb73e18ff7c5c1da

## Context of Re-Review

This is a targeted re-review of a prose-only revision. Only change r2 → r3: every reference to "Step 6" that meant the new Extract Heuristic step was relabeled to "Step 7". The precondition was updated to reference "Step 6 (Enrich)" instead of "Step 5 (Write Recovery Record)". No behavioral, schema, or API changes.

**Why the relabel:** `skills/recover/SKILL.md` already has a Step 6 "Enrich" at line 267 that writes the recovery record to `.context-index/hygiene/recoveries/`. The new extraction step's `evidence[]` references the recovery record path, so the extraction must run *after* Enrich, not as a new Step 6.

## Structural Architect (targeted)

**Verdict:** PASS

- Precondition correctly references Step 6 (Enrich).
- All 16 behavior statements consistently use "Step 7" for the new step.
- Remaining Step 6 references correctly point to the existing Enrich step.
- Logical ordering sound: Enrich writes record → Step 7 reads path into evidence[].
- Task Map and Acceptance Criteria consistent.
- No structural issues introduced by the relabel.
- No findings.

## Consistency Analyzer (targeted)

**Verdict:** PASS_WITH_NOTES → PASS (after charter fix)

**CON-R-1** [warning] [charter-alignment] — Charter Capability Map row for "Recover Extraction" still said "Step 6" in its description (line 83: `/adev:recover` Step 6 distills…). The r3 spec and all its behaviors/preconditions/task map/acceptance criteria correctly said "Step 7", but the charter description was not updated in the same revision.

**Resolution:** Charter updated in the same re-review cycle:
- Line 22 scope bullet: "Extraction steps added to `/adev:recover` (Step 6)" → "`/adev:recover` (Step 7, placed after the existing Step 6 Enrich)"
- Line 83 Capability Map: "`/adev:recover` Step 6 distills…" → "`/adev:recover` Step 7 distills a root-cause diagnosis into a heuristic entry (runs after Step 6 Enrich)"

Other findings:
- All "Step 6" references in the r3 spec correctly refer to the existing Enrich step. Relabel is internally consistent throughout.
- Cross-spec: `store-and-helper.md` Behaviors 11-12 are cited by number in both extraction specs. No renumbering occurred in `store-and-helper.md`; behaviors 11-12 still match expected content (auto-promotion thresholds).
- `validate-extraction.md` still says "Check 12" with no conflict against the Step 7 relabel. Sibling spec is clean.
- API usage, evidence shape, confidence values, scope derivation, id derivation all consistent across specs and charter.

## Security Reviewer

**Verdict:** Not re-dispatched

This is a prose-only change that does not touch any of the security-relevant content (scope validation, id validation, path safety, redaction advisory, atomicity). The r2 security verdict (PASS_WITH_NOTES) stands unchanged.

---

## Summary

**Total new findings:** 1 warning (CON-R-1, resolved in same cycle by updating charter)

**Status transition:** `review-pending` → `review-passed`

**Planning gate:** UNLOCKED. Proceed to `/adev:plan --spec .context-index/specs/features/heuristics/recover-extraction.spec.md`.
