# Live Spec: Phase Token Capture

---
charter: token-observability
status: draft
risk_level: medium
milestone: v1
created: 2026-03-25
---

## Behavioral Contract

### Preconditions

- A validated lifecycle scenario is loaded
- The eval runner executes phases through a wrapper that can return structured token metadata
- Each scenario run has a unique `run_id`
- Each phase attempt and subagent attempt has a stable id within the run

### Behaviors

1. **When** the lifecycle eval runner executes a phase **then** it records a normalized token event for the main phase execution.
2. **When** a phase dispatches one or more subagents **then** the runner records one normalized token event per subagent execution, linked to the parent phase id, and stops further subagent capture once the scenario's `max_subagent_events_per_phase` limit is reached.
3. **When** the execution wrapper returns structured token metadata **then** the runner stores `input_tokens`, `output_tokens`, and `total_tokens` from that payload without recomputing them.
4. **When** token metadata is unavailable for a phase or subagent **then** the runner emits a token event with explicit per-field `unknown` availability markers and continues the scenario run.
5. **When** a phase is retried or re-run **then** each attempt is recorded as a distinct event sequence with its own attempt number.
6. **When** token capture completes for a scenario run **then** all normalized events are persisted to one raw event log file for that scenario run.
7. **When** a structured token payload is internally inconsistent, such as `total_tokens` not matching `input_tokens + output_tokens` when all three are present, **then** capture fails validation for that event and reports the inconsistency explicitly.
8. **When** a normalized token event is emitted **then** it includes `run_id`, `scenario_id`, `event_id`, `event_index`, `actor_type`, `phase_id`, `phase_name`, `skill_name`, `attempt`, `status`, and per-token-field availability values so downstream reporting can reconstruct realized execution order without inference.
9. **When** a subagent token event is emitted **then** it includes `parent_phase_event_id`, `subagent_role`, and `actor_type = subagent`.
10. **When** a main phase token event is emitted **then** it includes `actor_type = phase` and omits `subagent_role`.
11. **When** a phase summary is derived **then** `subagent_count` is calculated from the number of linked subagent events for that parent phase event.

### Postconditions

- One normalized main-phase token event is emitted per phase attempt
- One normalized token event is emitted per subagent attempt
- Each subagent event references a valid parent phase id
- Token events are written to one raw event file per scenario run
- Unknown token availability is explicitly represented per token field, not omitted
- Event ordering is explicit via `event_index` and stable within one scenario run
- No phase can emit more than `max_subagent_events_per_phase` subagent events

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|---|---|---|
| Missing token payload | Emit event with per-field `unknown` availability, continue | `token_data_unknown` |
| Partial token payload | Emit known fields, mark unknown fields explicitly, continue | `token_data_partial` |
| Inconsistent token totals | Fail event validation with run id and phase or subagent id | `token_total_mismatch` |
| Subagent event missing parent phase id | Fail capture validation | `missing_parent_phase` |
| Normalized event missing required identity or ordering fields | Fail capture validation | `invalid_normalized_event` |
| Subagent events exceed the configured per-phase ceiling | Mark the scenario run `failed` with bounded-execution error | `max_subagent_events_exceeded` |
| Raw event file cannot be written after the run has started | Mark the scenario run `incomplete` with explicit file error and preserve prior artifacts | `raw_event_write_failed` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because capture and serialization use Node.js built-ins only.
- **Principle:** "Skills are primarily markdown" — Applies because capture logic belongs in runner or orchestration code, not inside SKILL files.
- **Principle:** "Pure ESM" — Applies because capture modules must remain `.mjs`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Event schema | Define the normalized token event structure | small |
| Token normalization | Implement phase and subagent token normalization | medium |
| Unknown handling | Add per-field unknown-availability handling | small |
| Raw event writer | Persist one raw event log per scenario run using path-contained `run_id` file names | medium |
| Validation tests | Cover malformed, partial, and inconsistent payloads | medium |

## Acceptance Criteria

- [ ] Main phases emit normalized events
- [ ] Subagent executions emit linked normalized events
- [ ] Retry attempts are distinguishable in the event log
- [ ] Missing token metadata is represented explicitly and does not silently disappear
- [ ] Inconsistent token totals are rejected
- [ ] Event ordering and actor type are explicit in every normalized event
- [ ] `subagent_count` is derivable from linked subagent events for each phase
- [ ] `max_subagent_events_per_phase` prevents unbounded fan-out capture
- [ ] One raw event file is produced per scenario run
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
