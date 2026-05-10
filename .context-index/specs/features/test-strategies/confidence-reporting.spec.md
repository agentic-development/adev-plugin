---
charter: test-strategies
status: validated
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/assignment.mjs
    - lib/test-strategies/detection.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# SPEC 9: Confidence Reporting

## Capability

Strategy assignments include confidence level (high/medium/low) so humans can review low-confidence assignments before proceeding.

## Behavioral Contract

### Preconditions

- resolveStrategy has been called and produced a StrategyAssignment
- The assignment includes a confidence field

### Behaviors

1. When a strategy is assigned from a spec declaration, then confidence is always "high" (the human explicitly chose it)
2. When a strategy is assigned from a manifest declaration matching task file paths, then confidence is "high" (the project explicitly configured it)
3. When a strategy is assigned from auto-detection with a strong indicator (e.g., dbt_project.yml exists and task touches models/*.sql), then confidence is "high"
4. When a strategy is assigned from auto-detection with a weak indicator (e.g., task touches a directory name that partially matches but could be ambiguous), then confidence is "medium"
5. When a strategy is assigned from auto-detection with only indirect evidence (e.g., file extension matches but no project-level indicator), then confidence is "low"
6. When a strategy is the fallback (unit), then confidence is "high" (unit is always a valid default)
7. When plan outputs tasks with low-confidence assignments, then each low-confidence task is marked with: "⚠ Low confidence — verify strategy assignment before proceeding"
8. When all tasks have high confidence, then no advisory is shown (no noise)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Detection cannot determine confidence | Defaults to "medium" | CONFIDENCE_INDETERMINATE |

## Constitution Reference

- "Skills are primarily markdown" — Confidence levels are surfaced in plan markdown output for human review

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define confidence assignment rules | Map source + detection strength to confidence level | small |
| Integrate confidence into detection heuristics | Each heuristic returns confidence alongside strategy_id | small |
| Plan output formatting | Show advisory for low-confidence assignments | small |

## Acceptance Criteria

- [ ] Spec-declared and manifest sources always produce high confidence
- [ ] Detection heuristics return confidence based on indicator strength
- [ ] Fallback to unit is always high confidence
- [ ] Low-confidence assignments show advisory in plan output
- [ ] High-confidence-only plans show no advisory (no noise)
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
