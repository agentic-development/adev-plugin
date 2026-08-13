---
charter: {{ module_name }}
kind: action
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
milestone:        <!-- optional — milestone from charter capability map, or explicit override (e.g., v1, v2, mvp) -->
revision: 1
charter-revision: {{ charter_revision }}
created: {{ date }}
updated: {{ date }}
---

# Action Spec: {{ spec_title }}

<!-- Action Spec within the {{ module_name }} charter.
     An action spec describes a one-shot operational procedure (cleanup, backfill,
     migration tool, smoke validation, deployment runbook). Use the Devin-style
     postcondition-first framing: define DONE first, then steps that reach it.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md
     Exemplar: .context-index/specs/features/lifecycle-artifacts/smoke-validation.spec.md -->

<!-- # tracker-ref: -->

## Postconditions

<!-- State-of-world after this action runs and passes. Defines DONE.
     Write each postcondition as a verifiable assertion about the world.
     Postconditions are the contract — Procedure is the implementation. -->

1. **{{ postcondition_name }}:** ...
2. **{{ postcondition_name }}:** ...
3. **{{ postcondition_name }}:** ...

## Procedure

<!-- Ordered, executable steps that reach the postconditions above.
     Each step is a manual command, a check, or a one-line instruction.
     Steps should be re-runnable; document any non-idempotent side effects
     explicitly in the Idempotency section below. -->

### Step 1: {{ step_title }}

<!-- Describe the action. Include exact commands when applicable. -->

### Step 2: {{ step_title }}

<!-- ... -->

### Step 3: {{ step_title }}

<!-- ... -->

## Idempotency

<!-- What happens if this action is run twice?
     - Safe to re-run? State the read-only steps and the writing steps.
     - If a step fails mid-procedure, how does re-running behave?
     - Are there one-way state transitions (e.g., closing an issue, advancing a milestone)?
       If so, document that re-running after sign-off is a no-op. -->

...

## Rollback

<!-- How is this action undone?
     - For read-only actions, rollback is implicit (no state changed).
     - For state-changing actions, document the inverse operation.
     - If rollback is impossible (e.g., destructive backfill), say so explicitly
       and document the operational pre-flight check that should run before re-execution. -->

...

## System Constitution Reference

<!-- Which constitutional principles or architecture boundaries govern this action.
     Cite by number or section heading; explain why each applies. -->

- **{{ principle_or_boundary }}** — Applies because ...
- ...

## Acceptance Criteria

<!-- Concrete, verifiable criteria for this action spec to be considered complete.
     Each postcondition above should map to at least one acceptance criterion.
     /adev:validate checks these after execution. -->

- [ ] All postconditions verified
- [ ] All procedure steps executed without unrecoverable failure
- [ ] Idempotency contract holds on re-run
- [ ] No constitutional violations introduced
