# Refactoring Spec: {{ spec_title }}

<!-- Refactoring spec within the {{ module_name }} charter.
     Extends the Live Spec format with current-state/target-state analysis and migration path.
     Parent Charter: .context-kit/specs/features/{{ module_name }}/charter.md -->

---
charter: {{ module_name }}
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
mode: refactor
created: {{ date }}
---

## Current State

<!-- Describe the code as it exists today. Be specific about files, patterns, and problems. -->

### Structure

<!-- Key files and their roles in the current implementation. -->

| File | Role | Lines | Notes |
|------|------|-------|-------|
| ... | ... | ... | ... |

### Problems

<!-- What is wrong with the current state. Be precise: performance numbers, complexity metrics,
     bug frequency, developer friction. Avoid vague complaints. -->

1. ...
2. ...
3. ...

### Dependencies

<!-- What other code depends on the current implementation. These are your migration constraints. -->

- ...

## Target State

<!-- Describe what the code should look like after refactoring. -->

### Structure

<!-- Key files and their roles in the target implementation. -->

| File | Role | Notes |
|------|------|-------|
| ... | ... | ... |

### Improvements

<!-- How the target state addresses each problem listed in Current State. -->

1. ...
2. ...
3. ...

## Migration Path

<!-- Step-by-step plan for getting from current to target state.
     Each step must leave the system in a working state (all tests pass).
     This is the critical section: a bad migration path causes regressions. -->

### Step 1: {{ step_title }}

- **What:** ...
- **Why first:** ...
- **Risk:** ...
- **Verification:** Tests that must pass after this step

### Step 2: {{ step_title }}

- **What:** ...
- **Why next:** ...
- **Risk:** ...
- **Verification:** ...

<!-- Add more steps as needed. Prefer many small steps over few large ones. -->

## Invariants

<!-- Properties that must remain true throughout the entire migration.
     Every migration step must preserve these. They are your safety net. -->

- [ ] All existing tests continue to pass at every step
- [ ] Public API contracts do not change (unless the spec explicitly permits it)
- [ ] No data loss or corruption during migration
- [ ] ...

## Behavioral Contract

<!-- Same as a standard Live Spec: define the target behavior. -->

### Behaviors

1. **When** ... **then** ...
2. **When** ... **then** ...

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|-----------|-------------------|--------------------------|
| ... | ... | ... |

## System Constitution Reference

- **Principle:** "{{ principle_text }}" — Applies because ...

## Acceptance Criteria

- [ ] All current tests pass without modification (unless explicitly scoped for change)
- [ ] New tests cover the refactored code paths
- [ ] Problems listed in Current State are resolved
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
