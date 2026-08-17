---
charter: test-strategies
status: implemented
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/profiles.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# SPEC 8: Fallback Behavior

## Capability

When no profile exists for an assigned strategy, fall back to unit profile with an advisory message.

## Behavioral Contract

### Preconditions

- A strategy has been assigned to a task via resolveStrategy
- getStrategyProfile is called to load the profile

### Behaviors

1. When getStrategyProfile is called with a strategy ID that has a corresponding profile, then the profile is returned without any advisory
2. When getStrategyProfile is called with a strategy ID that has no corresponding profile, then the unit profile is returned and an advisory message is logged: "Strategy profile '<strategy_id>' not found — falling back to unit profile"
3. When getStrategyProfile is called with a strategy ID whose profile exists but is malformed or incomplete, then the unit profile is returned and a warning is logged identifying the specific issues (e.g., "Profile 'schema' missing required field: red_exit_condition — falling back to unit")
4. When the unit profile itself is missing or malformed, then a hardcoded minimal unit profile is used as the absolute fallback (this is the "fallback of the fallback" — it should never happen in practice but prevents a cascade failure)
5. When a fallback occurs during plan integration, then the plan output marks the affected task with `source: "fallback"` and appends a human-readable `reason` field to the strategy object (e.g., `strategy: { strategy_id: "unit", source: "fallback", confidence: "high", reason: "Profile for 'schema' not found" }`)
6. When a fallback occurs during write-test dispatch, then write-test logs the advisory at the start of RED phase and proceeds with unit rules

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Unit profile itself is missing | Hardcoded minimal unit profile used, error logged | UNIT_PROFILE_MISSING |
| Profile directory is not readable | Unit fallback with permission error logged | PROFILE_DIR_UNREADABLE |

## Constitution Reference

- "Minimize external dependencies" — Fallback logic uses no external dependencies
- "Skills are primarily markdown" — Advisory messages are human-readable, logged to the skill output

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement fallback chain in getStrategyProfile | Profile found → return; not found → unit; unit missing → hardcoded minimal | small |
| Define hardcoded minimal unit profile | Last-resort profile with basic unit test rules | small |
| Advisory message formatting | Consistent format for fallback advisories across plan and write-test | small |
| Plan output fallback metadata | Add fallback and reason fields to task strategy object | small |

## Acceptance Criteria

- [ ] Missing profiles fall back to unit with advisory
- [ ] Malformed profiles fall back to unit with specific field warnings
- [ ] Hardcoded minimal unit profile exists as absolute fallback
- [ ] Plan output includes fallback metadata when fallback occurs
- [ ] Write-test logs advisory at RED phase start when falling back
- [ ] No errors thrown — fallback is always graceful
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
