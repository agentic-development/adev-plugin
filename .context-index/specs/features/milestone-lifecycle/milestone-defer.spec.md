# Live Spec: Milestone Defer

---
charter: milestone-lifecycle
status: review-passed
risk_level: low
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

## Behavioral Contract

### Preconditions

- `.context-index/milestones.yaml` exists with at least one milestone entry
- `lib/milestones.mjs` provides `loadMilestones()`, `saveMilestones()`, `findMilestone()`, `validateMilestoneName()` (from milestone-crud spec)

### Behaviors

1. **When** `milestone defer <name> --reason "<text>"` is invoked **then** the milestone's status is updated to `deferred` in `milestones.yaml` and a `defer_reason` field is set with the provided text.

2. **When** `milestone defer <name>` is invoked and the milestone has `status: shipped` **then** it is rejected: "Cannot defer a shipped milestone."

3. **When** `milestone defer <name> --reason "<text>"` is invoked and the milestone already has `status: deferred` **then** it is idempotent: the `defer_reason` is updated with the new reason, and a message confirms: "Milestone '<name>' is already deferred. Reason updated."

4. **When** `milestone defer <name>` succeeds **then** the linked epic's status is updated to `deferred` via `issueManager.updateEpic(epicId, { status: "deferred" })` if an issue manager is available.

5. **When** `milestone defer <name>` succeeds and no issue manager is available **then** the milestone is deferred in YAML but the epic status is not updated, with a warning: "Issue board not configured; epic status not updated."

### Postconditions

- After successful defer: `milestones.yaml` entry has `status: deferred` and `defer_reason: "<text>"`. If issue manager available, the linked epic also has `status: deferred`.
- No issues are modified — only the epic status changes.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestone defer` with no name argument | Print usage hint and exit | MISSING_NAME |
| `milestone defer` with invalid name | Reject with "Invalid milestone name" | INVALID_NAME |
| `milestone defer <name>` where name not found | "Milestone '<name>' not found" | MILESTONE_NOT_FOUND |
| `milestone defer <name>` without `--reason` | "Reason is required. Use --reason \"<text>\"" | MISSING_REASON |
| `milestone defer <name>` where status is `shipped` | "Cannot defer a shipped milestone" | ALREADY_SHIPPED |
| `issueManager.updateEpic()` throws | Warn but do not roll back — milestone is deferred in YAML | EPIC_UPDATE_FAILED |

### Implementation Notes

- `defer_reason` is a new optional field on the Milestone entity. `saveMilestones()` and `loadMilestones()` in `lib/milestones.mjs` must be extended to serialize/deserialize it. The value must be YAML-quoted (like the existing `confirm` field) to prevent injection from special characters.
- The `reason` parameter is always required (MISSING_REASON on empty/null), including on re-defer.

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — no new dependencies required; uses existing `loadMilestones`/`saveMilestones` I/O.
- **Principle:** "Skills are primarily markdown" — SKILL.md documents the subcommand; `milestoneDefer` is companion code.
- **Principle:** "Pure ESM" — `.mjs` extension.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. `milestoneDefer` function | Implement `milestoneDefer(projectRoot, name, reason, options)` in `lib/milestones.mjs`. Validates name and reason, loads milestone, checks status guards, updates YAML, optionally updates epic. | small |
| 2. SKILL.md `milestone defer` documentation | Add `milestone defer` subcommand section to `skills/issues/SKILL.md`. | small |
| 3. Tests for milestone defer | Unit tests covering: defer success, idempotent re-defer, reject shipped, missing reason, epic update failure. | small |

## Acceptance Criteria

- [ ] `milestone defer v1.0.0 --reason "Pushed to Q3"` updates status to `deferred` with reason
- [ ] `milestone defer` on a shipped milestone is rejected with ALREADY_SHIPPED
- [ ] `milestone defer` on an already-deferred milestone updates the reason idempotently
- [ ] `milestone defer` updates the linked epic status to `deferred` when issue manager available
- [ ] `milestone defer` without `--reason` is rejected with MISSING_REASON
- [ ] All error cases return expected error codes
- [ ] `milestoneDefer` is exported and independently testable
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
