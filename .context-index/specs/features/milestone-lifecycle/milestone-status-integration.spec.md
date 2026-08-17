---
charter: milestone-lifecycle
status: review-passed
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

# Live Spec: Status Integration

## Behavioral Contract

### Preconditions

- `/adev:status` skill exists at `skills/status/SKILL.md`
- `lib/milestones.mjs` provides `loadMilestones()` and `findMilestone()`
- `milestones.yaml` may or may not exist

### Behaviors

1. **When** `/adev:status --milestone <name>` is invoked **and** `milestones.yaml` exists **and** the milestone is found **then** the status output includes milestone metadata from `milestones.yaml`: status, target_date, ship_criteria count, and defer_reason (if deferred), in addition to the existing epic/issue progress display.

2. **When** `/adev:status --milestone <name>` is invoked **and** `milestones.yaml` exists **and** the milestone is not found **then** the existing behavior continues unchanged (queries issue board only). An advisory note is added: "Note: milestone '<name>' is not defined in milestones.yaml."

3. **When** `/adev:status --milestone <name>` is invoked **and** `milestones.yaml` does not exist **then** the existing behavior continues unchanged (no milestone metadata section).

4. **When** `/adev:status --all` is invoked **and** the Milestone Progress section is displayed **and** `milestones.yaml` exists **then** each milestone row includes metadata from `milestones.yaml` (target_date, status, ship_criteria count) alongside the epic/issue aggregation from the issue board.

5. **When** `getMilestoneStatusData(projectRoot, name)` is called **then** it returns `{ milestone, found: boolean }` where `milestone` is the entry from `milestones.yaml` (or null if not found/file missing).

### Postconditions

- No state is mutated — status integration is read-only.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestones.yaml` malformed | Skip milestone metadata, display issue-board-only data | — |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — instructions added to `skills/status/SKILL.md`; `getMilestoneStatusData` is a small companion helper
- **Principle:** "Minimize external dependencies" — reuses existing `loadMilestones`/`findMilestone`

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. `getMilestoneStatusData` helper | Add to `lib/milestones.mjs`. Wraps findMilestone with graceful error handling. | small |
| 2. SKILL.md status integration | Update `skills/status/SKILL.md` to reference milestone metadata from `milestones.yaml` in both `--milestone` and `--all` modes. | small |
| 3. Tests | Unit tests for `getMilestoneStatusData`. | small |

## Acceptance Criteria

- [ ] `getMilestoneStatusData` returns milestone data when found
- [ ] `getMilestoneStatusData` returns `{ milestone: null, found: false }` when not found
- [ ] `getMilestoneStatusData` returns `{ milestone: null, found: false }` when file missing or malformed
- [ ] `/adev:status` SKILL.md references milestones.yaml metadata in `--milestone` mode
- [ ] `/adev:status` SKILL.md references milestones.yaml metadata in `--all` Milestone Progress section
- [ ] All quality gates pass
