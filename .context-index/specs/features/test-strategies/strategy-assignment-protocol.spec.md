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
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Spec: Strategy Assignment Protocol

## Capability

Rules for how plan assigns a strategy per task: spec-declared > manifest-declared > auto-detected > fallback to unit

## Behavioral Contract

### Preconditions

- The strategy type registry is available
- A task has been decomposed by plan with file paths
- manifest.yaml may contain a test_strategies section
- The parent Live Spec may contain a test_strategy field in frontmatter

### Behaviors

1. When `resolveStrategy(task, manifest, spec)` is called, then it returns a StrategyAssignment with: strategy_id, source (spec-declared/manifest/detected/fallback), and confidence (high/medium/low)
2. When the parent spec has a `test_strategy` field in frontmatter, then that strategy is used with source "spec-declared" and confidence "high", regardless of manifest or detection results
3. When no spec override exists but manifest.yaml has a test_strategies entry whose paths match the task's file paths, then that strategy is used with source "manifest" and confidence "high"
4. When neither spec nor manifest provides a strategy but auto-detection identifies a strategy from the task's file paths, then that strategy is used with source "detected" and confidence from the detection heuristic
5. When no strategy is resolved from any source, then `unit` is returned with source "fallback" and confidence "high"
6. When the priority chain resolves a strategy, then the resolution order is strictly: spec-declared > manifest > detected > fallback (higher sources always win)
7. When resolveStrategy completes, then it logs the resolution source so humans can audit the assignment

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec declares unknown strategy_id | Warning logged, falls through to manifest/detected/fallback | UNKNOWN_SPEC_STRATEGY |
| Manifest entry matches but has unknown strategy_id | Warning logged, falls through to detected/fallback | UNKNOWN_MANIFEST_STRATEGY |
| Task has no file paths | Falls through to fallback (unit) | NO_FILE_PATHS |

## Constitution Reference

- "Skills are primarily markdown" — The priority chain rules are documented in skill markdown; resolveStrategy is a helper function
- "Minimize external dependencies" — Uses only Node.js built-ins for glob matching

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement resolveStrategy function | Priority chain: spec > manifest > detected > fallback | medium |
| Implement manifest path matching | Match task file paths against manifest test_strategies path globs | medium |
| Implement source logging | Log the resolution source for audit trail | small |
| Integration with plan output | Ensure plan can call resolveStrategy per task | small |

## Acceptance Criteria

- [ ] Spec-declared strategy always takes precedence over all other sources
- [ ] Manifest-declared strategy takes precedence over auto-detected
- [ ] Auto-detected strategy takes precedence over fallback
- [ ] Fallback is always `unit` with high confidence
- [ ] Unknown strategy IDs produce warnings, not errors, and fall through
- [ ] Resolution source is logged for every assignment
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
