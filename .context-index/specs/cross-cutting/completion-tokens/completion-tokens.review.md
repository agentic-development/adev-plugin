---
spec: completion-tokens/completion-tokens.spec.md
verdict: PASS_WITH_NOTES
date: 2026-06-02
last-reviewed-revision: 1
file-sha: 1bf6b53e425f48f48e27c667867a4b274b26d7ea44daeda934251295d58f2002
---

# Architecture Review: completion-tokens

> **Date:** 2026-06-02
> **Spec:** `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md`
> **Charter:** `.context-index/specs/cross-cutting/completion-tokens/charter.md`
> **Verdict:** PASS_WITH_NOTES

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning (sonnet) | plugin:review-specs/structural |
| security-reviewer | Security Reviewer | subagent | reviewer-fast (haiku) | plugin:review-specs/security |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast (haiku) | plugin:review-specs/consistency |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- [warning] SA-1: B5 omitted the `PASS_PENDING_HUMAN` convergence stop-verdict (the `--require-human-final-pass` path), leaving its token undefined. The three named verdicts (`BUDGET_EXHAUSTED`, `NO_PROGRESS`, `REGRESSED`) and config key `build.max_review_retries` were verified correct against `lib/loop-convergence.mjs` and `skills/build/SKILL.md`. **Resolved:** B5 + the pinned mapping now route `PASS_PENDING_HUMAN` → `BLOCKED` (halt awaiting sign-off; pipeline did not reach COMPLETE).
- [suggestion] SA-2: Persona-overlay carve-out currently lists only disk artifacts; the exemption must be *added* as a new bullet (covered by T3). Wording clarified in the Module Impact Map.
- [suggestion] SA-3: T5 drift-guard could also assert the exact grammar string / final-line position, not just presence. Carried into planning.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- [suggestion] SEC-1: Subagents could emit a token-grammar line; the last-line anchor (B7) already defends, but the spec should explicitly forbid subagent token emission. **Resolved:** B8 now forbids subagent completion-token emission.
- [suggestion] SEC-2: Completion tokens create a second persona-exempt output class; document the precedent so exemptions don't proliferate. Carried into T4 (docs).

Token design assessed as low-surface, deterministic, carries no sensitive data; spoofing risk bounded by adev skill ownership + last-line anchoring.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- [warning] MOD-1: `affects:` listed `output-personas` (a feature name), not a manifest module slug. **Resolved:** changed to `setup` (the module containing `skills/using-adev/SKILL.md`).
- [suggestion] CHR-1: Charter's Affected Modules table uses the feature name "output-personas"; could align to `setup`. Minor; the spec's Module Impact Map now clarifies.

Confirmed: charter scope faithfully implemented (build + validate only); `charter-revision: 2` matches charter `revision: 2`; out-of-scope correctly preserved; provider-mirror parity acknowledged.

---

## Summary

**Total findings:** 7 (0 blockers, 2 warnings, 5 suggestions)
**Action required:** None blocking. Both warnings (SA-1, MOD-1) and one suggestion (SEC-1) were incorporated into the spec at revision 1 before lock. Remaining suggestions (SA-3, SEC-2, CHR-1) are carried into `/adev:plan`. Spec is **review-passed** and ready for planning.
