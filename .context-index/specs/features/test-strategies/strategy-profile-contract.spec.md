---
charter: test-strategies
status: validated
revision: 2
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
---

# Spec: Strategy Profile Contract

## Capability

Define what each profile Live Spec must contain: RED exit condition, GREEN exit condition, gaming blockers, assertion rules, seed data rule, handoff format

## Behavioral Contract

### Preconditions

- A strategy type exists in the registry
- `strategyId` argument to `getStrategyProfile()` MUST be validated against the strategy registry via `getStrategy(strategyId)` — any registered strategy ID is valid
- A strategy profile is being authored as a Live Spec for one of the registered strategy types

### Behaviors

1. When `getStrategyProfile(strategyId)` is called, then it returns a profile object with required fields: strategy_id, red_exit_condition, green_exit_condition, gaming_blockers (array), assertion_rules, seed_data_rule, handoff_format, and permitted_tools (array)
2. When a profile defines `red_exit_condition`, then it specifies what tool/command must exit non-zero to confirm RED state (e.g., for unit: "test runner exits non-zero because behavior is not implemented"; for schema: "migration assertion script exits non-zero because schema change doesn't exist yet")
3. When a profile defines `green_exit_condition`, then it specifies what tool/command must exit zero to confirm GREEN state (e.g., for unit: "test runner exits zero"; for policy: "conftest test exits zero")
4. When a profile defines `gaming_blockers`, then it lists strategy-specific patterns that indicate vacuous or misleading tests (e.g., for schema: "testing on empty database"; for contract: "structure-only assertions without semantic checks")
5. When a profile defines `assertion_rules`, then it specifies what assertions are valid for this strategy (e.g., for unit: "mocking boundaries enforce external-only mocks"; for policy: "Rego deny rules must check values not just key existence")
6. When a profile defines `seed_data_rule`, then it specifies how test data must be prepared (e.g., for unit: "deterministic, explicitly constructed"; for schema: "representative production-like data seeded before migration"; for fixture: "input/output fixture files with known data")
7. When a profile defines `handoff_format`, then it specifies the structure of the immutable handoff block passed from write-test to implement (e.g., for unit: current SHA-256 + test file contents; for contract: Pact file + consumer expectations)
8. When a profile is incomplete (missing required fields), then `getStrategyProfile()` returns the unit profile as fallback and logs a warning identifying the missing fields

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Profile file does not exist for strategy_id | Returns unit profile as fallback with advisory | PROFILE_NOT_FOUND |
| Profile file exists but is malformed | Returns unit profile as fallback with warning | PROFILE_PARSE_ERROR |
| Profile missing required fields | Returns unit profile as fallback, lists missing fields | INCOMPLETE_PROFILE |

## Constitution Reference

- "Skills are primarily markdown" — Strategy profiles are markdown documents (Live Specs) that write-test consumes as structured instructions
- "Minimize external dependencies" — Profile loading uses Node.js fs built-ins only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define profile schema | Document the required fields, their types, and their semantics | medium |
| Implement getStrategyProfile function | Load and validate a profile by strategy ID, with fallback | medium |
| Create unit profile as reference | The unit strategy profile (codifies current write-test behavior) | medium |
| Document profile authoring guide | How to write a strategy profile Live Spec | small |

## Acceptance Criteria

- [ ] Profile contract defines all 8 required fields with clear semantics
- [ ] getStrategyProfile returns a valid profile for any of the 9 strategy IDs
- [ ] Missing or malformed profiles fall back to unit with warnings
- [ ] The unit profile fully captures current write-test behavior (mocking boundaries, 9 gaming patterns, seed data rule, handoff block)
- [ ] Profile schema is documented as a reference for future profile authors
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
