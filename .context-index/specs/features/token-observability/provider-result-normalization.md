# Live Spec: provider-result-normalization

## Capability

Normalize provider-specific live execution results into the shared lifecycle token event and run metadata contract.

## Behavioral Contract

1. **When** a provider wrapper returns a phase result **then** a shared normalizer converts it into the existing lifecycle token capture shape plus provider-specific metadata fields.
2. **When** a provider wrapper returns provider-native field names or nested structures **then** the shared normalizer maps them into the canonical eval schema instead of allowing wrapper-specific shapes downstream.
3. **When** a provider wrapper returns structured token metadata **then** the normalizer preserves reported counts exactly and marks availability per token field.
4. **When** a provider wrapper omits token fields **then** the normalizer emits explicit per-field `unknown` markers rather than estimating counts.
5. **When** a provider wrapper returns a model identifier, command outcome, reason code, artifact paths, or other provider metadata **then** the normalizer maps those into canonical provider-run metadata fields and preserves only allowlisted fields permitted for that metadata class.
6. **When** a provider wrapper returns a main phase result **then** the normalizer emits the canonical identity and ordering fields required by `phase-token-capture`, including `run_id`, `scenario_id`, `event_id`, `event_index`, `actor_type = phase`, `phase_id`, `phase_name`, `skill_name`, `attempt`, and `status`.
7. **When** a provider wrapper returns subagent results **then** the normalizer emits linked canonical subagent records with `event_id`, `event_index`, `actor_type = subagent`, `parent_phase_event_id`, `subagent_role`, `attempt`, and status fields compatible with `phase-token-capture`.
8. **When** a provider wrapper returns provider-run metadata such as `provider_id`, `model_id`, `reason_code`, or `artifact_paths` **then** that metadata is attached to the run-scoped normalized result and repeated on subagent records only where `phase-token-capture` already requires it.
9. **When** a provider wrapper returns malformed data, including invalid status values, invalid phase mappings, unsafe artifact paths, inconsistent token totals, or missing canonical identity fields **then** normalization fails explicitly for that provider-scenario phase.
10. **When** normalization fails for one provider-scenario phase **then** orchestration may terminate that provider-scenario run, but the rest of the matrix continues.

## Preconditions

- A validated provider wrapper result exists for one phase execution
- Scenario phase ids are known
- Eval artifact root is known for artifact path containment checks
- Shared event schema from `phase-token-capture` is already defined

## Postconditions

- One canonical normalized main-phase result is produced per provider phase execution
- Zero or more canonical normalized subagent results are produced per provider phase execution
- Normalized main-phase results include:
  - `run_id`
  - `provider_id`
  - `scenario_id`
  - `event_id`
  - `event_index`
  - `actor_type`
  - `phase_id`
  - `phase_name`
  - `skill_name`
  - `attempt`
  - `status`
  - `trigger_type`
  - `model_id`
  - `reason_code`
  - `artifact_paths`
  - per-field token availability markers
- Normalized subagent results additionally include:
  - `parent_phase_event_id`
  - `subagent_role`
- Provider-run metadata remains a run-scoped normalized sidecar unless a field is already part of the canonical event schema
- Downstream orchestration and reporting do not need provider-specific parsing logic

## Error Cases

| Condition | Expected Behavior |
|---|---|
| Unknown or invalid provider status | Fail normalization for that phase |
| Wrapper returns phase id not in scenario | Fail normalization for that phase |
| Unsafe artifact path outside eval root | Fail normalization for that phase |
| Inconsistent token totals | Fail normalization for that phase |
| Provider metadata contains non-allowlisted fields needed only for raw provider output | Drop the field or fail normalization explicitly |
| Subagent result missing parent linkage information | Fail normalization for that phase |
| Normalized result missing canonical identity or ordering fields | Fail normalization for that phase |
| Wrapper returns non-object or malformed payload | Fail normalization for that phase |

## Constitution References

- Minimize external dependencies
- Eval-boundary isolation
- Deterministic contracts over provider-specific drift

## Actionable Task Map

1. Define canonical provider-result schema
2. Implement shared normalization layer
3. Define the allowlist scope for provider metadata by field class
4. Add artifact-root containment checks
5. Add malformed-wrapper validation tests
6. Route normalized results into existing capture/orchestration code

## Acceptance Criteria

- Provider-specific wrapper outputs normalize into one canonical schema
- Canonical normalized results include the identity and ordering fields required by `phase-token-capture`
- Unknown token fields remain explicit
- Subagent results become linked canonical subagent records
- Unsafe artifact paths are rejected
- Provider-run metadata is explicitly scoped as run-level sidecar data unless `phase-token-capture` already defines the field on events
- Non-allowlisted provider metadata does not leak into downstream reporting
- Downstream code no longer needs provider-specific parsing branches
