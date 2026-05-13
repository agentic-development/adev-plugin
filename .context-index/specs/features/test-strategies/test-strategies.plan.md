<!-- DO NOT EDIT statuses inline — see lifecycle log test-strategies.jsonl -->
# Implementation Plan: Test Strategies Module

> **Charter:** test-strategies
> **Specs covered:** All 10 (strategy-type-registry, manifest-schema-extension, strategy-detection-heuristics, strategy-assignment-protocol, strategy-profile-contract, plan-integration, write-test-dispatch, fallback-behavior, confidence-reporting, cross-strategy-gaming-patterns)
> **Date:** 2026-04-20

## Dependency Graph

```
Layer 1: strategy-type-registry (no deps)
Layer 2: manifest-schema-extension (depends on registry)
         strategy-detection-heuristics (depends on registry)
         strategy-profile-contract (depends on registry)
Layer 3: strategy-assignment-protocol (depends on registry, manifest, detection)
         fallback-behavior (depends on profile-contract)
         cross-strategy-gaming-patterns (depends on profile-contract)
Layer 4: confidence-reporting (depends on assignment-protocol)
         plan-integration (depends on assignment-protocol)
         write-test-dispatch (depends on profile-contract, gaming-patterns)
```

## Task List

### Layer 1: Foundation

#### Task 1: Strategy Type Registry
- **Spec:** strategy-type-registry
- **Strategy:** unit
- **Files:** `lib/test-strategies/registry.mjs`, `tests/lib/test-strategies/registry.test.mjs`
- **TDD:** Write tests for getStrategy(id), listStrategies(), null on unknown, alphabetical order → implement registry with 8 strategy definitions
- **Complexity:** medium

### Layer 2: Configuration & Detection

#### Task 2: Manifest Schema Extension
- **Spec:** manifest-schema-extension
- **Strategy:** unit
- **Files:** `lib/test-strategies/manifest.mjs`, `tests/lib/test-strategies/manifest.test.mjs`, `templates/manifest.yaml` (add commented example)
- **TDD:** Write tests for parseTestStrategies(manifest), validation, backward compat → implement parser
- **Complexity:** medium

#### Task 3: Strategy Detection Heuristics
- **Spec:** strategy-detection-heuristics
- **Strategy:** unit
- **Files:** `lib/test-strategies/detection.mjs`, `tests/lib/test-strategies/detection.test.mjs`
- **TDD:** Write tests for detectStrategies(projectRoot), detectTaskStrategy(filePaths) → implement detection with indicator mappings
- **Complexity:** medium

#### Task 4: Strategy Profile Contract & Fallback
- **Spec:** strategy-profile-contract, fallback-behavior
- **Strategy:** unit
- **Files:** `lib/test-strategies/profiles.mjs`, `tests/lib/test-strategies/profiles.test.mjs`, `lib/test-strategies/profiles/unit.md` (unit profile)
- **TDD:** Write tests for getStrategyProfile(id), fallback chain, hardcoded minimal unit profile → implement profile loading
- **Complexity:** medium

### Layer 3: Resolution

#### Task 5: Strategy Assignment Protocol & Confidence
- **Spec:** strategy-assignment-protocol, confidence-reporting
- **Strategy:** unit
- **Files:** `lib/test-strategies/assignment.mjs`, `tests/lib/test-strategies/assignment.test.mjs`
- **TDD:** Write tests for resolveStrategy(task, manifest, spec), priority chain, confidence levels → implement resolver
- **Complexity:** medium

#### Task 6: Cross-Strategy Gaming Patterns
- **Spec:** cross-strategy-gaming-patterns
- **Strategy:** unit
- **Files:** `lib/test-strategies/gaming.mjs`, `tests/lib/test-strategies/gaming.test.mjs`
- **TDD:** Write tests for 4 shared patterns (DISABLED_TESTS, EMPTY_ASSERTIONS, SWALLOWED_ASSERTIONS, CONDITIONAL_ASSERTIONS) → implement pattern detection
- **Complexity:** small

### Layer 4: Skill Integration

#### Task 7: Plan Integration
- **Spec:** plan-integration
- **Strategy:** unit
- **Files:** `skills/plan/SKILL.md` (modify to add strategy field per task)
- **TDD:** N/A for markdown skill changes — verified by acceptance criteria review
- **Complexity:** medium

#### Task 8: Write-Test Dispatch
- **Spec:** write-test-dispatch
- **Strategy:** unit
- **Files:** `skills/write-test/SKILL.md` (modify to load strategy profile and dispatch)
- **TDD:** N/A for markdown skill changes — verified by acceptance criteria review
- **Complexity:** large

### Summary

| Task | Spec(s) | Files | Complexity |
|------|---------|-------|------------|
| 1. Registry | strategy-type-registry | lib + tests | medium |
| 2. Manifest | manifest-schema-extension | lib + tests + template | medium |
| 3. Detection | strategy-detection-heuristics | lib + tests | medium |
| 4. Profiles | strategy-profile-contract, fallback-behavior | lib + tests + unit profile | medium |
| 5. Assignment | strategy-assignment-protocol, confidence-reporting | lib + tests | medium |
| 6. Gaming | cross-strategy-gaming-patterns | lib + tests | small |
| 7. Plan SKILL.md | plan-integration | skill markdown | medium |
| 8. Write-test SKILL.md | write-test-dispatch | skill markdown | large |

**Total: 8 tasks, ~12 new files, 2 modified skill files**
