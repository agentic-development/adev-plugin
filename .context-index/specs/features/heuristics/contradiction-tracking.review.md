# Architecture Review: contradiction-tracking

> **Date:** 2026-04-12
> **Spec:** .context-index/specs/features/heuristics/contradiction-tracking.md
> **Charter:** .context-index/specs/features/heuristics/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 2
file-sha: 4d6d7721b432fccb89846e56c1fd7ff79165fc3d

## Structural Architect

**Verdict:** PASS

- **SA-2** (warning): Contradiction scan should include `_global` heuristics, not just module-scoped. Recommendation noted for implementation.
- **SA-1** (suggestion): Semantic detection approach is well-designed with retro as backstop.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-7** (warning): `evidenceRef.path` not validated for path traversal. Low risk — field is advisory metadata, not used in file operations. Implementation should normalize paths.
- **SEC-8** (suggestion): Agent semantic comparison could trigger spurious contradictions. Retro consolidation is the backstop.
- **SEC-9** (suggestion): Contradiction scan should filter to module-scoped file only and apply `minConfidence` filter.

## Consistency Analyzer

**Verdict:** PASS (after fix)

- **CON-10** (blocker, **FIXED**): Removed "failure heuristic" / "success heuristic" terminology. Now describes contradictions in terms of `pattern` vs `antiPattern` field conflicts, aligned with the domain model.
- **CON-11** (warning, **FIXED**): Postcondition language updated to acknowledge that `addContradiction` may archive entries.
- **CON-12** (warning): Acceptance criteria reworded to clarify that the auto-archive chain is tested through extraction calls but implemented by `lib/heuristics.mjs`.

---

## Summary

**Total findings:** 8 (1 blocker fixed, 3 warnings, 4 suggestions)
**Action required:** Blocker CON-10 and warning CON-11 resolved in revision 2. Spec ready for planning.
