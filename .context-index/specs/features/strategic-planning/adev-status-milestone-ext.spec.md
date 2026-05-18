# Live Spec: adev:status Milestone Extension

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
  sha: "cbcfa00"
  files:
    - lib/issues/registry.mjs
    - skills/status/SKILL.md
    - tests/skills/assess.test.mjs
  computed-at: "2026-04-12T11:48:02.755Z"
drift_detected: true
---

## Behavioral Contract

### Preconditions

- `skills/status/SKILL.md` exists
- Issue model supports `milestone` field on Epic (spec: issue-model-milestone)

### Behaviors

1. **When** `--all` is invoked and milestones exist on epics **then** a "Milestone Progress" section is added to the dashboard showing per-milestone aggregation: total epics, total issues, open/in_progress/closed counts, percentage complete
2. **When** `--all` is invoked and no milestones exist **then** the dashboard is unchanged from current behavior
3. **When** `--milestone <name>` is invoked **then** a detailed single-milestone view is shown: milestone name, associated epics, all issues under those epics, spec status (draft/review-passed/implemented/validated) for related specs, charter capability progress
4. **When** `--milestone <name>` is invoked but no epics match **then** print "No epics found for milestone '<name>'. Available milestones: ..." and list known milestones

### Postconditions

- SKILL.md documents the `--milestone` argument and the Milestone Progress section in `--all` output

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--milestone <name>` with no matching epics | List available milestones | N/A |
| tasks.backend not configured | Skip milestone progress section entirely | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Changes are to SKILL.md content only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add --milestone argument | Document new argument in Arguments section | small |
| Add Milestone Progress section | Define aggregation logic for --all mode | medium |
| Add single milestone view | Define detailed view for --milestone mode | medium |

## Acceptance Criteria

- [ ] `--all` mode shows Milestone Progress section when milestones exist
- [ ] `--all` mode is unchanged when no milestones exist
- [ ] `--milestone <name>` shows detailed single-milestone view
- [ ] Missing milestone shows available milestones
- [ ] Gracefully handles unconfigured tasks.backend
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
