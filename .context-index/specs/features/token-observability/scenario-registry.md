# Live Spec: Scenario Registry

---
charter: token-observability
status: draft
risk_level: medium
milestone: v1
created: 2026-03-25
---

## Behavioral Contract

### Preconditions

- `tests/evals/lifecycle-tokens/scenarios/` exists
- Scenario files are JSON
- Each scenario has a unique hand-authored `scenario_id`
- Each phase has a unique hand-authored `id`

### Behaviors

1. **When** the lifecycle token eval runner loads the scenario registry **then** it reads all JSON scenario definitions from `tests/evals/lifecycle-tokens/scenarios/` and returns them in deterministic order.
2. **When** a scenario definition is loaded **then** it must expose hand-authored identity fields, a hand-authored ordered phase list, explicit branch definitions with trigger types, explicit lifecycle anchors, complexity tags, and bounded execution limits.
3. **When** a scenario defines a retry, re-review, recovery, validation loop, or fan-out path **then** that path must be represented explicitly as a branch edge in the JSON definition rather than inferred by the runner.
4. **When** two scenario definitions use the same scenario id **then** registry loading fails with an error.
5. **When** a scenario contains duplicate phase ids **then** registry loading fails with an error.
6. **When** a scenario definition is malformed or missing required fields **then** registry loading fails with a precise validation error identifying the file and invalid field.
7. **When** a branch references a phase id that does not exist in the same scenario **then** registry loading fails with an error.
8. **When** a scenario id is not a safe kebab-case slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` **then** registry loading fails with an error.
9. **When** a branch trigger type is not one of the declared supported values **then** registry loading fails with an error.
10. **When** a scenario omits `start_phase_id`, `terminal_phase_ids`, `max_total_steps`, `max_phase_visits`, or `max_subagent_events_per_phase` **then** registry loading fails with an error.
11. **When** no valid scenario definitions exist **then** the registry loader fails with an explicit `no scenarios found` error.

### Postconditions

- Registry load returns a deterministic ordered set of validated scenarios
- Each scenario exposes `scenario_id`, `scenario_name`, `phases[]`, `branches[]`, `complexity_tags[]`, `start_phase_id`, `terminal_phase_ids[]`, `max_total_steps`, `max_phase_visits`, and `max_subagent_events_per_phase`
- Each phase exposes `id`, `name`, and `skill_name`
- Every branch references valid phase ids in the same scenario
- Every branch exposes `branch_id`, `from_phase_id`, `to_phase_id`, and `trigger_type`
- The start phase id and every terminal phase id reference valid phase ids in the same scenario
- The supported trigger vocabulary is: `on_success`, `on_failure`, `on_review_reject`, `on_validation_retry`, `on_recovery_required`, and `on_fanout_complete`

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|---|---|---|
| Duplicate scenario id | Fail registry load with file list and duplicate id | `duplicate_scenario_id` |
| Duplicate phase id in one scenario | Fail registry load with file path and duplicate phase id | `duplicate_phase_id` |
| Invalid JSON | Fail with file path and parse error | `invalid_json` |
| Missing required field | Fail with file path and field name | `missing_required_field` |
| Branch references unknown phase | Fail with file path, branch name, and missing phase id | `unknown_phase_reference` |
| Scenario id is not a safe kebab-case slug | Fail with file path and invalid id | `invalid_scenario_id` |
| Unsupported branch trigger type | Fail with file path and invalid trigger type | `invalid_branch_trigger` |
| Missing start or terminal lifecycle anchors | Fail with file path and missing anchor field | `missing_lifecycle_anchor` |
| Missing or non-positive execution limits | Fail with file path and invalid limit field | `invalid_execution_limit` |
| Empty scenario directory | Fail with explicit `no scenarios found` error | `empty_registry` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because the registry format uses JSON and Node.js built-ins only.
- **Principle:** "Pure ESM" — Applies because the loader and validator should live in `.mjs` files and use ESM imports.
- **Principle:** "Skills are primarily markdown" — Applies because this spec keeps logic in the eval runner and not inside SKILL files.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Scenario directory | Create `tests/evals/lifecycle-tokens/scenarios/` | small |
| JSON contract | Define the registry shape for scenario entries, including lifecycle anchors, trigger vocabulary, and limits | medium |
| Loader and validator | Implement deterministic loading and schema validation | medium |
| Starter fixtures | Add happy-path and loop-heavy starter scenarios with explicit limits | medium |
| Validation tests | Cover duplicate ids, missing fields, invalid branches, invalid ids, and empty registry | medium |

## Acceptance Criteria

- [ ] Registry loads all valid scenario JSON files in deterministic order
- [ ] Duplicate scenario ids are rejected
- [ ] Duplicate phase ids are rejected
- [ ] Missing required fields are rejected
- [ ] Invalid scenario ids are rejected
- [ ] Missing `start_phase_id`, `terminal_phase_ids`, or execution limits are rejected
- [ ] Missing `max_subagent_events_per_phase` is rejected
- [ ] Unsupported branch trigger types are rejected
- [ ] Invalid branch edges are rejected
- [ ] Empty registry is rejected
- [ ] At least one happy-path scenario and one looped scenario validate successfully
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
