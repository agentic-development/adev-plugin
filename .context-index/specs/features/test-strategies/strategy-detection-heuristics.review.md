# Architecture Review: strategy-detection-heuristics

> **Date:** 2026-04-20
> **Spec:** .context-index/specs/features/test-strategies/strategy-detection-heuristics.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 3b6bfffc71b0875388818027fb3f840a89488c50

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reasoning | plugin:review-specs/structural |
| security-reviewer | Security Reviewer | subagent | capable | plugin:review-specs/security |
| consistency-analyzer | Consistency Analyzer | subagent | fast | plugin:review-specs/consistency |

## Findings

| ID | Severity | Description |
|----|----------|-------------|
| SA-4 | warning | Smoke strategy has no explicit heuristic defined. Clarify fallback behavior when no heuristic matches. |
| SA-5 | suggestion | Add threshold field to task-level detection rules for optional boundary-based strategy selection. |
| SEC-04 | warning | Symlink following in file scanning may expose unintended paths. Document policy and consider --no-follow flag. |
| CON-14 | suggestion | fs.glob (used for pattern matching) requires Node.js v22+. Confirm minimum version or use fallback. |

## Summary

**Total findings:** 4 (0 blockers, 2 warnings, 2 suggestions)
**Action required:** Proceed to planning. Address warnings and suggestions during implementation for complete heuristic coverage and compatibility.
