---
charter: {{ module_name }}
kind: integration
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
milestone:        <!-- optional — milestone from charter capability map, or explicit override -->
revision: 1
charter-revision: {{ charter_revision }}
created: {{ date }}
updated: {{ date }}
---

# Integration Spec: {{ spec_title }}

<!-- Integration Spec within the {{ module_name }} charter.
     An integration spec wires two or more existing modules/skills together. It defines
     the participants and their roles, the interaction contract (who calls what, in
     what order), the observable state machine, and how failures propagate across the
     boundary.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md
     Exemplar: .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md -->

<!-- # tracker-ref: -->

## Participants

<!-- The modules, skills, libraries, or external systems involved in this integration.
     Each row: identity + role in the interaction.
     Use module paths (e.g., `lib/foo.mjs`) or skill names (e.g., `/adev:hygiene`)
     so the participants are unambiguous. -->

| Module | Role |
|---|---|
| `{{ participant }}` | ... |
| `{{ participant }}` | ... |

## Interaction Contract

<!-- Who calls what, in what order. Multiple flows are fine — give each a heading.
     Describe trigger conditions, the sequence of calls, and what each participant
     produces or returns. Be explicit about which fields/values cross the boundary. -->

**On {{ trigger_event }}:**
1. {{ participant }} ...
2. {{ participant }} ...
3. {{ participant }} ...

**On {{ trigger_event }}:**
1. ...
2. ...

## State Machine

<!-- Observable states and transitions. Use an ASCII diagram or a table.
     The state machine should be testable: each state has an observable signature,
     and each transition is triggered by a named event from the Interaction Contract. -->

```
{{ state_diagram }}
```

States:
- `{{ state_name }}`: ...
- `{{ state_name }}`: ...

## Error Propagation

<!-- How failures cascade across participants. Each row: where the error originates,
     how it propagates (return code, exception, sentinel field), and what the consumer
     does about it. Document any errors that are intentionally swallowed or downgraded
     (e.g., non-blocking warnings) — those are contract decisions. -->

| Origin | Propagates as | Consumer behavior |
|---|---|---|
| ... | ... | ... |
| ... | ... | ... |

## System Constitution Reference

<!-- Which constitutional principles or architecture boundaries govern this integration.
     Cite by number or section heading; explain why each applies. -->

- **{{ principle_or_boundary }}** — Applies because ...
- ...

## Acceptance Criteria

<!-- Concrete, verifiable criteria for this integration to be considered complete.
     Each interaction-contract flow should map to at least one acceptance criterion.
     /adev:validate checks these after implementation. -->

- [ ] All participants implement their role per the contract
- [ ] State transitions match the state machine on observed runs
- [ ] Error propagation matches the table above
- [ ] Tests cover each flow end-to-end
- [ ] No constitutional violations introduced
