# Live Spec: live-provider-execution

## Capability

Execute lifecycle scenarios through real Claude, Codex, and OpenCode wrappers in automated eval mode.

## Behavioral Contract

1. **When** the live eval entrypoint runs **then** it executes the same lifecycle scenario matrix for each registered provider in deterministic provider order.
2. **When** the live eval entrypoint begins one provider-scenario run **then** it creates a unique `run_id`, preserves the active `provider_id` and `model_id` when known, and executes that run in an isolated subprocess or worker boundary with an explicit timeout.
3. **When** a provider is intentionally unavailable **then** the harness records that provider-scenario run as `incomplete` with a provider-availability reason code family and continues.
4. **When** a provider wrapper executes a phase **then** it returns provider-native phase output, which the harness passes to the shared provider-result normalizer before any token events or reports are derived.
5. **When** normalized provider results contain structured token metadata **then** the harness forwards it into the existing token event pipeline without recomputing counts.
6. **When** a provider wrapper cannot supply some or all token fields **then** the harness records explicit per-field `unknown` markers and continues.
7. **When** a provider wrapper returns subagent results **then** the harness records them as linked subagent events under the parent phase.
8. **When** a provider wrapper fails a phase with a declared trigger type **then** orchestration follows the existing branch rules for retries, re-review, or recovery.
9. **When** a provider wrapper times out, exceeds a payload limit, or fails in a way not covered by the scenario graph **then** that provider-scenario run is marked `failed` or `incomplete` with a deterministic reason code, the wrapper process is force-terminated if needed, partial artifacts are preserved, and the matrix continues.
10. **When** a provider wrapper emits artifact paths or provider-supplied labels **then** paths must remain contained within the eval artifact root and labels must be normalized before downstream rendering.

## Preconditions

- Scenario registry is valid
- Provider wrapper registry is valid
- Each available wrapper exposes `runPhase(...)`
- Live eval artifact root is writable
- Wrapper execution timeout and payload limits are configured
- Wrapper cleanup behavior after timeout or payload-limit violations is defined

## Postconditions

- Each provider receives the same scenario set
- Each provider-scenario run has:
  - `run_id`
  - `provider_id`
  - `model_id` when known, otherwise explicit unknown marker
  - `scenario_id`
  - `status`
  - `reason_code`
  - `artifact_paths`
  - token metadata or explicit unknown markers
- One provider failure does not abort other providers or scenarios
- No single provider wrapper can block the matrix past the configured timeout or payload bounds
- Payload limits apply to the serialized provider wrapper result before normalization; stdout or stderr logging limits may be enforced separately but do not change the normalized contract

## Error Cases

| Condition | Expected Behavior |
|---|---|
| Provider unavailable | Mark run `incomplete` with availability reason |
| Wrapper throws before result | Mark run `incomplete` with execution reason |
| Wrapper exceeds timeout | Mark run `incomplete` with timeout reason and continue |
| Wrapper exceeds payload limit | Mark run `failed` with payload-limit reason and continue |
| Wrapper returns invalid phase id mapping | Mark run `failed` with normalization reason |
| Wrapper emits artifact path outside eval root | Reject path and mark run `failed` |
| Wrapper returns malformed token payload | Reject payload and mark run `failed` |

## Constitution References

- Zero-dependency Node implementation
- Eval-boundary isolation
- Deterministic execution ordering

## Actionable Task Map

1. Add live eval entrypoint or mode
2. Integrate provider registry with scenario orchestration
3. Route provider-native wrapper output through shared normalization
4. Add unavailable-provider, timeout, payload-limit, and partial-token handling
5. Add process termination and cleanup handling for timeout or payload-limit violations
6. Add tests for pass, incomplete, timeout, payload-limit, and malformed-wrapper cases

## Acceptance Criteria

- The same scenarios run across Claude Code, Codex, and OpenCode
- Each provider-scenario run preserves `run_id`, `provider_id`, and `model_id` when known
- Unavailable providers produce explicit `incomplete` runs
- Wrapper execution is isolated and bounded by timeout and payload limits
- Timeout and payload-limit violations terminate the offending wrapper execution and do not leak resources into later runs
- Structured token metadata flows into the existing event pipeline
- Partial token support is preserved with `unknown` markers
- Wrapper failures do not abort the rest of the matrix
