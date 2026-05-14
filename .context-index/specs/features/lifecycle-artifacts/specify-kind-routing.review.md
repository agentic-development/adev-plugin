---
last-reviewed-revision: 2
file-sha: 75772beb4713563ee7d5670aa379332f9a2de44dd5c0c2d84f44c73349c0a86b
---

# Architecture Review: specify-kind-routing

> **Date:** 2026-05-14
> **Spec:** .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.spec.md
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| security-reviewer | Security Reviewer | subagent | reasoning (claude-opus-4-7) | single-pass module review |
| consistency-analyzer | Consistency Analyzer | subagent | reasoning (claude-opus-4-7) | single-pass module review |

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-8** (warning): `--mode` flag values in the orthogonality table do not match `/adev:specify`'s existing argument syntax. The spec lists `--mode standard`, `--mode extract`, etc., but the existing skill uses `--extract`, `--refactor`, `--from-diff`, `--cross-cutting` as direct flags (not values of `--mode`). The spec then says "the existing `--mode refactor` flag is preserved" — but there is no `--mode` flag today. Either (a) introduce `--mode` as a new flag this spec adds, or (b) keep them as direct flags and rewrite the orthogonality table accordingly.

## Security Reviewer

**Verdict:** PASS

No findings.

## Consistency Analyzer

**Verdict:** PASS

- **CON-3** (suggestion): "Action template" framing called "Devin-style postcondition-first" — consistent with charter line 32. No change.

---

## Summary

**Total findings:** 2 (0 blockers, 1 warning, 1 suggestion)
**Action required:** Spec advances to `review-passed`. Resolve `--mode` vs direct-flag confusion (SA-8) before implementation. Does not block /adev:plan.

**Reviewer summary:** Skill-routing intent is correct and well-bounded; the `--mode` vs direct-flag confusion needs resolution before planning.
