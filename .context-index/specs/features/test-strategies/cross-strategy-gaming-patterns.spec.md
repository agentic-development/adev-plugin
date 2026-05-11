---
charter: test-strategies
status: validated
revision: 2
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/gaming.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# SPEC 10: Cross-Strategy Gaming Patterns

## Capability

Shared gaming detection patterns that apply across all strategies (e.g., disabled tests, empty assertions).

## Behavioral Contract

### Preconditions

- A strategy profile is loaded (any registered strategy type)
- Write-test is performing gaming detection during RED or GREEN phase

### Behaviors

1. When write-test performs gaming detection, then it checks both the strategy-specific gaming_blockers from the loaded profile AND the shared cross-strategy patterns
2. When a test file contains `.skip(`, `xit(`, `xdescribe(`, `.todo(`, or equivalent disabled-test markers for the detected test framework, then gaming is detected regardless of strategy (shared pattern: DISABLED_TESTS)
3. When a test file contains no assertions at all (empty test body or only setup/teardown), then gaming is detected regardless of strategy (shared pattern: EMPTY_ASSERTIONS)
4. When a test file contains `try { ... } catch {}` that swallows assertion failures without rethrowing, then gaming is detected regardless of strategy (shared pattern: SWALLOWED_ASSERTIONS)
5. When a test file contains assertions guarded by `if (condition) { expect... }` without an else branch, then gaming is detected regardless of strategy (shared pattern: CONDITIONAL_ASSERTIONS)
6. When a strategy-specific gaming blocker fires, then it is reported with the strategy prefix (e.g., "SCHEMA: empty database"); when a shared pattern fires, it is reported with "SHARED:" prefix
7. When both a shared pattern and a strategy-specific pattern fire on the same test, then both are reported (they are independent checks)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Test framework not recognized | Shared patterns still apply (they use generic detection), strategy-specific patterns may be less accurate | UNKNOWN_FRAMEWORK |

## Constitution Reference

- "Skills are primarily markdown" — Gaming patterns are documented in markdown; detection is instruction-based, not executable code in SKILL.md
- "Minimize external dependencies" — Pattern detection uses string/regex matching only

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define shared gaming patterns | Document the 4 universal patterns with detection rules | small |
| Integrate shared patterns into write-test | Write-test checks shared patterns in addition to profile-specific ones | medium |
| Prefix-based reporting | SHARED: vs strategy-specific prefix in gaming violation reports | small |

## Acceptance Criteria

- [ ] 4 shared gaming patterns defined: DISABLED_TESTS, EMPTY_ASSERTIONS, SWALLOWED_ASSERTIONS, CONDITIONAL_ASSERTIONS
- [ ] Shared patterns fire regardless of strategy type
- [ ] Strategy-specific patterns fire independently of shared patterns
- [ ] Violations include clear prefix (SHARED: or strategy name)
- [ ] Both shared and strategy-specific violations reported when both fire
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
