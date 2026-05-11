# Architecture Review: milestone-ship

> **Date:** 2026-05-09
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1

## Reviewers Dispatched

| ID | Name | Mode | Profile |
|----|------|------|---------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | fast |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- SA-1 (warning): `evaluateShipCriteria` behavior when `epic_id` is null should be explicit — clarify whether BROKEN_EPIC is thrown by evaluateShipCriteria or milestoneShip. Precondition 3 conflicts with the BROKEN_EPIC error case; relax precondition.
- SA-2 (warning): Return type for `evaluateShipCriteria` results array is described per-behavior but not as a consolidated schema. Implementation should define the type in JSDoc.
- SA-5 (warning): Epic close may throw BLOCKED_BY_DEPENDENCIES from the issue manager's close guard. Add error handling for this case — either document it or note that `all_issues_closed` implicitly satisfies the guard.
- SA-6 (warning): Git tag creation ordering relative to milestone status update is undefined. If tag creation fails after status is set to `shipped`, state is inconsistent. Recommend: create tag first, then update status.
- SA-7 (suggestion): CRITERIA_FAILED is used for both `all_issues_closed` and `gates_pass` failures. The detailed results array distinguishes them, so a single error code is acceptable — but document this in implementation.
- SA-9 (suggestion): Semver regex `/^\d+\.\d+\.\d+/` would not match names like `v1.0.0` (with `v` prefix). Clarify: strip `v` prefix before matching, or match `v?` optionally. Tag should avoid double `v` prefix.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- SEC-1 (warning): `gates_pass` check must use `execFile` with `shell: false` (array args), not `execSync` with shell interpolation. The spec says "executes via child_process" — implementation must follow the `quality-gate.mjs` pattern.
- SEC-2 (warning): Git tag creation must use array-based args (`['git', 'tag', tagName]`), not shell string concatenation. Milestone name regex is restrictive enough to prevent injection, but defense in depth.
- SEC-5 (warning): Partial atomicity on epic close failure is documented and acceptable for CLI use. Note this in SKILL.md as a known partial-failure mode.
- SEC-3 (suggestion): `gh` CLI token exposure — avoid passing `--debug` flag. Current spec approach (graceful degradation) is sound.
- SEC-4 (suggestion): TOCTOU on git tag existence is low-risk for single-user CLI. Document for CI/CD contexts.
- SEC-6 (suggestion): Consider applying secret redaction to test stderr output from `gates_pass`.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

- CON-1 (suggestion): Clarify that `child_process` usage is owned by `milestoneShip()` orchestrator, not `evaluateShipCriteria()`.
- CON-2 (suggestion): Idempotency check (already shipped → no-op) should be tested explicitly in `milestoneShip()`.
- CON-3 (suggestion): Consider behavior for unrecognized `check` types — either ignore with warning or fail with UNKNOWN_CHECK.
- CON-4 (suggestion): SKILL.md must document the interactive confirm prompt format.

---

## Summary

**Total findings:** 14 (0 blockers, 7 warnings, 7 suggestions)
**Action required:** Address warnings during implementation — particularly execFile usage, tag ordering, and epic close guard handling. No blockers prevent planning.
