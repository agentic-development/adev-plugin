# Live Spec: Run Orchestration

---
charter: token-observability
status: draft
risk_level: medium
milestone: v1
created: 2026-03-25
---

## Behavioral Contract

### Preconditions

- Scenario registry has been loaded and validated
- Scenario definitions include explicit `start_phase_id`, one or more explicit terminal phase ids, ordered phases, and explicit branch edges with trigger types
- Phase execution wrappers are available to the runner
- Raw event output location is writable
- Each scenario definition includes positive `max_total_steps` and `max_phase_visits` limits

### Behaviors

1. **When** the lifecycle token eval entrypoint is invoked **then** it loads the validated scenario registry and executes all scenarios serially in deterministic order.
2. **When** a scenario run starts **then** the orchestrator creates a lowercase RFC 4122 UUID `run_id`, initializes path-contained raw event output for that run, and begins executing the scenario from its declared start phase.
3. **When** a phase completes successfully **then** the orchestrator follows a matching `on_success` branch if one exists; otherwise it advances according to the scenario's declared phase order.
4. **When** a phase fails in a way covered by a declared branch edge trigger **then** the orchestrator follows that branch to the next declared phase and records the transition.
5. **When** a phase fails in a way not covered by any declared branch edge **then** the orchestrator marks the scenario run `failed` with a reason code and continues to the next scenario.
6. **When** a scenario reaches one of its declared terminal phases on a valid path **then** the orchestrator marks the run `passed`.
7. **When** a phase wrapper throws or raw artifact generation fails after the run has started **then** the orchestrator marks the run `incomplete` with a deterministic execution reason code and preserves all partial artifacts already written.
8. **When** the scenario exceeds `max_total_steps` or any phase exceeds `max_phase_visits` **then** the orchestrator marks the run `failed` with a bounded-execution reason code and stops the scenario.
9. **When** any phase emits more than `max_subagent_events_per_phase` subagent events **then** the orchestrator marks the run `failed` with a bounded-execution reason code and stops the scenario.
10. **When** orchestration finishes for the full matrix **then** all scenario run statuses are available for reporting.

### Postconditions

- Each scenario produces one scenario run record
- Scenario runs execute serially in deterministic order
- Every transition between phases is traceable to declared phase order or a declared branch edge
- Each scenario run ends with one terminal status: `passed`, `failed`, or `incomplete`
- Failed scenarios do not prevent later scenarios from running
- No scenario can exceed its declared step or per-phase visit limits
- No phase can exceed its declared subagent fan-out limit

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|---|---|---|
| Scenario has no valid start phase | Mark scenario `failed` with configuration reason | `invalid_start_phase` |
| Scenario has no terminal phases | Mark scenario `failed` with configuration reason | `missing_terminal_phase` |
| Multiple matching branch edges for same trigger | Mark scenario `failed` with ambiguous-branch reason | `ambiguous_branch` |
| No matching branch for unexpected failure | Mark scenario `failed` with unhandled-transition reason | `unhandled_transition` |
| Phase wrapper throws before returning structured result | Mark scenario `incomplete` with execution reason and persist partial artifacts | `phase_execution_error` |
| Scenario exceeds `max_total_steps` | Mark scenario `failed` with bounded-execution reason | `max_total_steps_exceeded` |
| Phase exceeds `max_phase_visits` | Mark scenario `failed` with bounded-execution reason | `max_phase_visits_exceeded` |
| Phase exceeds `max_subagent_events_per_phase` | Mark scenario `failed` with bounded-execution reason | `max_subagent_events_exceeded` |
| Raw event or report directory cannot be initialized before the run starts | Mark scenario `failed` with explicit file-system reason | `artifact_init_failed` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because orchestration must remain file-based and use Node.js built-ins only.
- **Principle:** "Skills are primarily markdown" — Applies because orchestration wraps eval execution and must not change live skill behavior.
- **Principle:** "Pure ESM" — Applies because orchestration modules remain `.mjs`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Scenario-run state machine | Define run ids, statuses, reason codes, and bounded-execution rules | medium |
| Serial executor | Implement deterministic serial scenario execution | medium |
| Branch resolution | Resolve trigger-based transitions between phases, including `on_success` precedence | medium |
| Terminal handling | Add passed, failed, and incomplete status handling with deterministic failure mapping | medium |
| Orchestration tests | Cover happy path, loop path, and unhandled failure | medium |

## Acceptance Criteria

- [ ] Scenarios execute serially in deterministic order
- [ ] Declared failure, retry, re-review, and recovery branches are followed correctly
- [ ] Unhandled failures terminate only the affected scenario
- [ ] `max_total_steps` and `max_phase_visits` prevent unbounded loop execution
- [ ] `on_success` branches take precedence over default sequential next-phase transitions
- [ ] `max_subagent_events_per_phase` prevents unbounded fan-out execution
- [ ] Each scenario ends with one terminal status and reason code when needed
- [ ] Partial artifacts remain available for incomplete and failed runs
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
