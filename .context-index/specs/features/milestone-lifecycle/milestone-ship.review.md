# Architecture Review: milestone-ship

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-ship.spec.md
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** f242e34e8aed3b4a864366a92af20bd35fe276f1

## Reviewers Dispatched

| ID | Name | Mode | Profile |
|----|------|------|---------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | fast |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- SA-1 (warning): `gates_pass` criterion — spec says `execFileSync` with array args but `manifest.gates.test` is a string like `"npm test"`. String-to-array conversion (splitting on whitespace) is unspecified for commands with complex arguments. Clarify the expected format or conversion rule.
- SA-2 (warning): Behavior #13 says "first package entry" but Implementation Notes reference `packages["."]`. These could diverge in multi-package configs. Specify `packages["."]` as the canonical target in the behavioral contract.
- SA-3 (suggestion): Precondition requires `manifest.yaml` to have `gates.test`, but Behavior #4 handles empty criteria and NO_TEST_COMMAND error handles missing gates.test. Precondition is overstated.
- SA-4 (suggestion): PR detection branch name `release-please--branches--main` is hardcoded. Projects using other default branches (e.g., `release/0.x` per ADR-0008) would not match.
- SA-5 (suggestion): Task 5 (update loadMilestones/saveMilestones) may be a no-op if milestone-crud lands first. Add dependency ordering note.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- SEC-1 (warning): `release-as` value derived from milestone name — regex permits non-semver values like `...` or `1-2-3`. Add semver validation after v-prefix stripping before writing to config.
- SEC-2 (warning): `gates_pass` captures up to 500 chars of stderr which could contain secrets from test output. Note this as a data-exposure surface; consider masking patterns.
- SEC-3 (warning): `gh pr list --head` prefix match could match unintended branches (e.g., `release-please--branches--main-evil`). Confirm `gh` matching semantics or post-filter results.
- SEC-4 (suggestion): After `JSON.parse` of release-please config, validate schema (assert `packages` key exists) before writing `release-as` to prevent silent corruption.
- SEC-5 (suggestion): No pre-flight check on git state before tag creation (strategy: tag-only). Consider verifying HEAD is on expected branch and working tree is clean.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- CON-1 (blocker → resolved): Frontmatter `charter-revision: 2` did not match charter revision 3. **Fixed:** updated to `charter-revision: 3`.
- CON-3 (warning): Injectable executors (`options.execGit`, `options.execGh`, `options.writeReleasePleaseConfig`) are a pattern unique to `milestoneShip` — sibling specs don't use it. Document as intentional for testing.
- CON-5 (warning): Spec does not explicitly clarify that version parity (`package.json` ↔ `plugin.json`) is handled by release-please's `extra-files` config, not by `milestoneShip`. Add clarifying note.
- CON-6 (warning): `evaluateShipCriteria` throwing BROKEN_EPIC when `epic_id` is null conflicts with precondition wording. Relax precondition to explicitly state null is handled.
- CON-7 (suggestion): Execution order documentation (behaviors 17-19) is unique to this spec — justified by rollback semantics.
- CON-8 (suggestion): Semver regex `/^v?\d+\.\d+\.\d+/` should be cross-referenced with milestone-name-validation spec for consistency.

---

## Summary

**Total findings:** 16 (1 blocker resolved, 8 warnings, 7 suggestions)
**Action required:** Address warnings during implementation — particularly gates.test format (SA-1), packages["."] targeting (SA-2), semver validation for release-as (SEC-1), stderr exposure (SEC-2), and version parity clarification (CON-5). No blockers remain after charter-revision fix.
