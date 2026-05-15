---
charter: test-strategies
status: validated
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - skills/plan/SKILL.md
    - lib/test-strategies/assignment.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
drift_detected: true
drift_source: skills/plan/SKILL.md
drift_at: 2026-05-15T13:52:45.903Z
---

# Spec: Plan Integration

**Capability:** Extend plan output to include `strategy` field per task with assignment source and confidence

## Behavioral Contract

### Preconditions

- The plan skill is decomposing a spec into tasks
- The strategy type registry and resolveStrategy function are available
- The parent spec may declare a test_strategy in frontmatter
- manifest.yaml may contain a test_strategies section

### Behaviors

1. When plan decomposes a spec into tasks, then each task in the plan output includes a `strategy` object with fields: strategy_id (strategy slug), source (spec-declared/manifest/detected/fallback), and confidence (high/medium/low)
2. When the parent spec declares `test_strategy: schema` in frontmatter, then every task in the plan inherits strategy "schema" with source "spec-declared" unless a task-level override exists
3. When a task's file paths trigger a different strategy via auto-detection than the spec-level default, the spec-declared strategy always wins (per the assignment protocol priority chain). Within the `detected` source tier only, a task-level file path match can override a project-level detection result.
4. When plan outputs the task list, then a summary table shows the strategy distribution: how many tasks per strategy and their sources
5. When all tasks resolve to "unit" regardless of source, then plan omits the strategy summary (backward-compatible — no noise for projects not using test strategies)
6. When a task's strategy has confidence "low", then plan marks it with an advisory: "⚠ Low confidence strategy assignment — review before proceeding"

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| resolveStrategy throws unexpectedly | Task defaults to unit/fallback/high, warning logged | STRATEGY_RESOLUTION_ERROR |
| Spec declares unknown test_strategy | Warning logged, falls through to manifest/detected/fallback per assignment protocol | UNKNOWN_SPEC_STRATEGY |

## Constitution Reference

- "Skills are primarily markdown" — Plan output is a markdown document; the strategy field is added to the existing task table format
- "Minimize external dependencies" — No new dependencies for strategy resolution

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Extend plan task schema | Add strategy object (id, source, confidence) to task output | small |
| Call resolveStrategy per task | Integrate resolveStrategy into the plan decomposition loop | medium |
| Strategy summary table | Add strategy distribution summary when strategies are non-trivial | small |
| Backward compatibility | Ensure plans without test_strategies look identical to today | small |

## Acceptance Criteria

- [ ] Every task in plan output includes a strategy field with id, source, and confidence
- [ ] Spec-level test_strategy propagates to all tasks unless overridden by task-level detection
- [ ] Strategy summary table appears when any task uses a non-unit strategy
- [ ] No strategy summary when all tasks are unit/fallback (backward compatible)
- [ ] Low-confidence assignments are flagged with advisory
- [ ] Plans for projects without test_strategies config are identical to current output
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
