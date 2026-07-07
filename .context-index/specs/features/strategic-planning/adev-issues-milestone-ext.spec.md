# Live Spec: adev:issues Milestone Extension

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: superseded
risk_level: low
milestone:
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-05-04
source-manifest:
  sha: "246c1b3"
  files:
    - lib/issues/registry.mjs
    - skills/issues/SKILL.md
    - tests/skills/assess.test.mjs
  computed-at: "2026-07-03T22:27:11.400Z"
---

## Behavioral Contract

### Preconditions

- `skills/issues/SKILL.md` exists
- Issue model supports `milestone` field on Epic (spec: issue-model-milestone)

### Behaviors

1. **When** `epic "<title>" --milestone <name>` is invoked **then** an epic is created with the `milestone` field set
2. **When** `epic "<title>"` is invoked without `--milestone` **then** the epic is created with `milestone: undefined` (backward compatible)
3. **When** `list --milestone <name>` is invoked **then** only epics and issues belonging to epics with that milestone are shown
4. **When** `update <epic-id> --milestone <name>` is invoked **then** the epic's milestone is updated
5. **When** displaying the full issue board (no arguments) and milestones exist on any epic **then** epics are grouped by milestone, with a "No Milestone" group for epics without one
6. **When** displaying the board and no epics have milestones **then** the display format is unchanged from current behavior (no milestone grouping)

### Postconditions

- SKILL.md documents the `--milestone` argument for `epic`, `list`, and `update` commands
- Board display adapts to show milestone grouping when milestones are present

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `list --milestone <name>` but no epics match | Show empty table with message "No epics found for milestone <name>" | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Changes are to SKILL.md content only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update Arguments section | Add `--milestone` to epic, list, and update commands | small |
| Update Board Display | Add milestone grouping logic when milestones exist | medium |
| Update Create Epic | Document milestone parameter in Create Epic section | small |

## Acceptance Criteria

- [ ] `epic` command accepts `--milestone <name>`
- [ ] `list` command accepts `--milestone <name>` filter
- [ ] `update` command accepts `--milestone <name>` for epics
- [ ] Board display groups by milestone when milestones exist
- [ ] Board display is unchanged when no milestones exist
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
