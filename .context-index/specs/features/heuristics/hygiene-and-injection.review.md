# Architecture Review: hygiene-and-injection

> **Date:** 2026-04-23
> **Spec:** `.context-index/specs/features/heuristics/hygiene-and-injection.spec.md`
> **Charter:** `.context-index/specs/features/heuristics/charter.md`
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 4ab483250e741982e36a76603510806a4688fbde

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| SA | Structural Architect | subagent | reasoning | combined review |
| SEC | Security Reviewer | subagent | reasoning | combined review |
| CON | Consistency Analyzer | subagent | reasoning | combined review |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- [warning] SA-1: Debug keyword derivation was underspecified ("extract nouns and technical terms"). **Fixed:** Behavior 8 now includes concrete tokenization rule (split on whitespace/punctuation, filter 3+ chars, remove stop words, take first 5), a worked example, and a fallback rule (< 3 tokens → empty keywords).
- [suggestion] SA-2: Behavior 7 used PASS for missing store; sibling passes use SKIP. **Fixed:** Changed to SKIP.
- [suggestion] SA-3: --fix auto-sync depends on sync-index being implemented first. Noted in depends-on clause.

## Security Reviewer

**Verdict:** PASS

- [suggestion] SEC-1: --fix auto-sync carries same permission surface as manual sync. Not a new risk class.
- [suggestion] SEC-2: Reviewer subagent heuristic injection has same surface as charter/spec content already included. Low risk.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- [warning] CON-2: Review-specs preamble diverged from canonical preamble. **Fixed:** Behavior 11 now uses the canonical preamble from Behavior 14.
- [warning] CON-5: Brainstorm new-module case should be documented as expected, not degraded. Advisory — the _global fallback is the correct path for new modules.

---

## Summary

**Total findings:** 7 (0 blockers, 4 warnings, 3 suggestions)
**Action required:** All warnings addressed in spec revision. Proceed to planning.
