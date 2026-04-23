# Architecture Review: keyword-tags-and-tiered-retrieval

> **Date:** 2026-04-23
> **Spec:** `.context-index/specs/features/heuristics/keyword-tags-and-tiered-retrieval.md`
> **Charter:** `.context-index/specs/features/heuristics/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 5ffcafc1b863e60046072f3fc3a590c687c83042

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| SA | Structural Architect | subagent | reasoning | combined review |
| SEC | Security Reviewer | subagent | reasoning | combined review |
| CON | Consistency Analyzer | subagent | reasoning | combined review |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- [warning] SA-2: Keyword boost sort priority relative to module-before-global tiebreaker was underspecified. **Fixed:** Behavior 9 now explicitly states keyword boost applies after confidence but before module-before-global.
- [warning] SA-3: Full tier rendering format overlaps with retrieval-filtering canonical format. Advisory — full tier is a superset, summary tier maps to the existing format.
- [suggestion] SA-4: Token estimates are approximate; long patterns could exceed 40 tokens at summary tier.
- [suggestion] SA-6: Task map now includes _format.md update task.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- [warning] SEC-1: Missing per-tag length and array count caps. **Fixed:** Behavior 3 now caps tags at 64 chars each and 20 entries max. Keywords capped at 10 entries, 200 chars each (Behavior 9).

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- [suggestion] CON-4: Error code column uses "N/A (no throw)" vs sibling specs using "—". Minor inconsistency.
- [suggestion] CON-5: Constitution reference omits Principle 2 — correct since this spec is library-only.

---

## Summary

**Total findings:** 9 (0 blockers, 5 warnings, 4 suggestions)
**Action required:** All warnings addressed in spec revision. Proceed to planning.
