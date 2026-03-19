# Live Spec: {{ spec_title }}

<!-- Live Spec within the {{ module_name }} charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md -->

---
charter: {{ module_name }}
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
created: {{ date }}
---

## Behavioral Contract

<!-- Define the observable behavior this spec mandates.
     Write from the perspective of what the system DOES, not how it does it internally.
     Each behavior statement should be directly testable. -->

### Preconditions

<!-- What must be true before this behavior can execute. -->

- ...

### Behaviors

<!-- The core behavioral statements. Each should map to one or more test cases. -->

1. **When** ... **then** ...
2. **When** ... **then** ...
3. **When** ... **then** ...

### Postconditions

<!-- What must be true after successful execution. -->

- ...

### Error Cases

<!-- How the system behaves when things go wrong. Each error case needs a test. -->

| Condition | Expected Behavior | HTTP Status / Error Code |
|-----------|-------------------|--------------------------|
| ... | ... | ... |

## System Constitution Reference

<!-- Which constitutional principles are most relevant to this spec.
     This helps reviewers and implementers know which rules apply. -->

- **Principle:** "{{ principle_text }}" — Applies because ...
- ...

## Actionable Task Map

<!-- A preliminary breakdown of implementation tasks.
     /adev-plan will refine this into a detailed plan after review. -->

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| ... | ... | small / medium / large |

## Acceptance Criteria

<!-- Concrete, verifiable criteria for this spec to be considered complete.
     /adev-validate checks these after implementation. -->

- [ ] ...
- [ ] ...
- [ ] ...
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
