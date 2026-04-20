---
charter: test-strategies
status: review-passed
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
---

# Spec: Write-Test Dispatch

**Capability:** Write-test loads the matching strategy profile and follows its rules instead of hardcoded unit-test rules

## Behavioral Contract

### Preconditions

- Write-test is invoked for a task that has a strategy assignment from plan
- The strategy profile contract is available
- getStrategyProfile function can load profiles

### Behaviors

1. When write-test begins the RED phase for a task, then it reads the task's strategy assignment and calls getStrategyProfile(strategyId) to load the matching profile
2. When a strategy profile is loaded successfully, then write-test uses the profile's red_exit_condition (instead of hardcoded "test runner fails for behavioral reasons"), gaming_blockers (instead of the hardcoded 9 patterns), assertion_rules (instead of hardcoded mocking boundaries), seed_data_rule (instead of hardcoded seed data rule), and handoff_format (instead of hardcoded SHA-256 + test file format)
3. When write-test is invoked with strategy "unit", then behavior is identical to current write-test behavior — the unit profile codifies all existing rules
4. When write-test is invoked with strategy "schema", then it follows the schema profile: RED means migration assertion script exits non-zero, gaming means testing on empty DB, seed data means representative production-like data
5. When write-test is invoked with strategy "policy", then it follows the policy profile: RED means conftest/OPA exits non-zero, gaming means checking key existence without value validation
6. When write-test is invoked with strategy "contract", then it follows the contract profile: RED means consumer contract verification fails, gaming means structure-only assertions
7. When write-test is invoked with strategy "fixture", then it follows the fixture profile: RED means transform output doesn't match expected fixture, gaming means trivially small fixtures
8. When the loaded profile falls back to unit (because the requested profile doesn't exist), then write-test logs an advisory: "Profile for '<strategy>' not found — using unit profile as fallback"
9. When write-test produces the immutable handoff block, then it uses the profile's handoff_format to structure the block (different strategies may have different handoff contents)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Task has no strategy assignment | Defaults to unit strategy | NO_STRATEGY_ASSIGNED |
| Profile load fails | Falls back to unit profile with warning | PROFILE_LOAD_FAILED |
| Profile's red_exit_condition is ambiguous | Write-test logs warning and uses unit's red_exit_condition | AMBIGUOUS_RED_CONDITION |

## Constitution Reference

- "Skills are primarily markdown" — Write-test's strategy dispatch is implemented in the SKILL.md instructions; profiles are markdown documents that write-test follows. Profile fields (red_exit_condition, green_exit_condition, etc.) are descriptive instructions consumed by the AI skill — no profile field is passed directly to a shell or exec API.
- "Minimize external dependencies" — No new dependencies; profile loading uses existing file reading
- "Hook protocol compliance" — Write-test's exit behavior (block on gaming, block on immediate pass) remains unchanged; only the rules for what constitutes "gaming" or "valid RED" change per profile

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add strategy dispatch to write-test SKILL.md | Modify write-test to read strategy assignment and load profile before RED phase | large |
| Refactor hardcoded rules into unit profile | Extract current mocking boundaries, 9 gaming patterns, seed data rule into the unit strategy profile | medium |
| Update handoff block generation | Make handoff block format configurable per profile | medium |
| Fallback and advisory logging | Log when falling back to unit profile | small |

## Acceptance Criteria

- [ ] Write-test reads the task's strategy assignment before starting RED phase
- [ ] Profile rules replace hardcoded rules for gaming detection, assertion rules, seed data, and handoff format
- [ ] Strategy "unit" produces identical behavior to current write-test
- [ ] Strategies with no profile fall back to unit with advisory message
- [ ] Handoff block format is determined by the profile
- [ ] All existing write-test tests continue to pass (backward compatible)
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
