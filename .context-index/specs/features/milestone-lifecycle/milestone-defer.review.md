# Architecture Review: milestone-defer

> **Date:** 2026-05-09
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-defer.spec.md
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

- SA-1 (warning): The `reason` parameter is required (MISSING_REASON error), but behavior 3 says "updated with the new reason if provided" on re-defer — ambiguous. Clarify: reason is always required, even on re-defer.
- SA-2 (suggestion): Task 1 complexity labeled "small" but involves dual validation, status guards, idempotency logic, and optional epic update — closer to "medium."
- SA-3 (suggestion): Acceptance criteria should include: re-defer message format test, and epic-unavailable warning test.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- SEC-1 (warning): `defer_reason` text flows into YAML serialization. The `saveMilestones()` serializer must quote this value (like the existing `confirm` field pattern) to prevent YAML injection from special characters, colons, or newlines.
- SEC-2 (suggestion): Consider a reasonable length limit on defer_reason (e.g., 500 chars) to prevent abuse.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- CON-1 (warning): `defer_reason` field is not in the current `saveMilestones()` or `loadMilestones()` implementation. Both must be extended to serialize/deserialize this field. This is an implementation prerequisite, not a spec defect.
- CON-2 (warning): Charter domain model (Milestone entity attributes) does not list `defer_reason`. Recommend updating the charter to include it as an optional attribute.
- CON-3 (suggestion): Status transition from `deferred` back to `planned` or `active` is not specified. Document whether defer is reversible.
- CON-4 (warning): Epic interaction uses `updateEpic()` for defer but `close()` for ship. Both are valid per the issue interface, but document the intentional difference: defer keeps the epic editable, ship closes it permanently.

---

## Summary

**Total findings:** 10 (0 blockers, 5 warnings, 5 suggestions)
**Action required:** Implementation must extend saveMilestones/loadMilestones for `defer_reason` field with proper YAML quoting. Clarify reason-required contract in behavior 3. No blockers prevent planning.
