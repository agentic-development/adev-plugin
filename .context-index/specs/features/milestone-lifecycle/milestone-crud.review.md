# Architecture Review: milestone-crud

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 79be42260f01c1556d59e559a5361da9c33431e3

## Reviewers Dispatched

| ID | Name | Mode | Profile |
|----|------|------|---------|
| structural-architect | Structural Architect | subagent | reasoning |
| security-reviewer | Security Reviewer | subagent | capable |
| consistency-analyzer | Consistency Analyzer | subagent | fast |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- SA-1 (blocker → resolved): Frontmatter `charter-revision: 2` did not match charter revision 3. **Fixed:** updated to `charter-revision: 3`.
- SA-2 (warning): `parseSimpleYaml()` from `lib/workspace.mjs` is referenced but not contractually bounded. The milestone schema requires nested objects (`release: { strategy: ... }`) and arrays (`ship_criteria`) — unclear if `parseSimpleYaml()` supports these. Clarify required parsing capabilities or note that a purpose-built parser may be needed.
- SA-3 (suggestion): `findMilestone` return contract is underspecified — charter declares it returns "a Milestone or null" but spec never defines its behavior (case sensitivity, malformed YAML handling). Add a brief behavior entry.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- SEC-1 (suggestion): Date regex `YYYY-MM-DD` does not enforce semantic correctness (e.g., `2026-13-99` passes regex). Add lightweight semantic validation.
- SEC-2 (suggestion): Confirm strategy validation uses strict equality (`Set.has()` or `includes()`) not prefix/substring matching.
- SEC-3 (suggestion): Confirm path construction from user-provided names only occurs after regex validation passes.
- SEC-4 (suggestion): Ensure YAML writer quotes or escapes string fields to prevent YAML injection from special characters.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- CON-1 (blocker → resolved): Frontmatter `charter-revision: 2` did not match charter revision 3. **Fixed:** updated to `charter-revision: 3`.
- All naming, pattern conformance, contract compatibility, and domain model alignment checks passed. Release field schema is consistent with milestone-ship spec. Error codes (`UNKNOWN_STRATEGY`) are shared correctly. Backward compatibility (`release: null` → `manual`) matches across specs.

---

## Summary

**Total findings:** 9 (2 blockers resolved, 1 warning, 6 suggestions)
**Action required:** Address the parser capability warning (SA-2) during implementation — verify `parseSimpleYaml()` handles nested objects and arrays, or use the `parseYaml` from `lib/profiles/yaml.mjs` which already handles these (as used by `lib/milestones.mjs` today). No blockers remain after charter-revision fix.
