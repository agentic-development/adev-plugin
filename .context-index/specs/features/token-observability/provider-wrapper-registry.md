# Live Spec: provider-wrapper-registry

## Capability

Define a deterministic live-provider wrapper registry for lifecycle token evals.

## Behavioral Contract

1. **When** the live lifecycle eval harness starts **then** it loads a provider wrapper registry from `tests/evals/lifecycle-tokens/providers/registry.mjs`.
2. **When** a provider wrapper is registered **then** it must expose canonical `provider_id`, capability flags, availability metadata, and a `runPhase(...)` function.
3. **When** a provider implementation is intentionally unavailable in the local environment **then** the registry still returns an entry for that provider with `is_available = false` and an explicit machine-readable `availability_reason` code.
4. **When** a provider wrapper fails to import or initialize unexpectedly **then** registry initialization fails with an explicit load error rather than silently treating that provider as intentionally unavailable.
5. **When** the harness asks for live providers **then** the registry returns deterministic ordering for `claude-code`, `codex`, and `opencode`.
6. **When** two wrappers declare the same `provider_id` **then** registry initialization fails with an explicit error.
7. **When** a wrapper does not satisfy the minimum contract **then** registry initialization fails with a precise validation error.
8. **When** a provider is marked unavailable **then** downstream orchestration may emit a provider-availability terminal reason, but registry loading itself does not fail.

## Preconditions

- `tests/evals/lifecycle-tokens/providers/` exists
- Registry exports entries for Claude Code, Codex, and OpenCode
- Each wrapper has a unique `provider_id`

## Postconditions

- Registry returns provider entries in fixed order:
  - `claude-code`
  - `codex`
  - `opencode`
- Each entry exposes:
  - `provider_id`
  - `supports_tokens`
  - `supports_model_id`
  - `supports_subagents`
  - `is_available`
  - `availability_reason`
  - `runPhase(...)`
- Missing providers are represented explicitly, not omitted

## Error Cases

| Condition | Expected Behavior |
|---|---|
| Duplicate `provider_id` | Fail registry initialization |
| Missing `runPhase(...)` | Fail registry initialization |
| Missing capability flag | Fail registry initialization |
| Unknown provider id | Fail registry initialization |
| Provider implementation absent on disk | Register provider as unavailable only when the registry explicitly declares that provider unavailable, with a machine-readable `availability_reason` such as `provider_not_installed` |
| Provider import or initialization throws unexpectedly | Fail registry initialization with load error |

## Constitution References

- Minimize external dependencies
- Eval-boundary isolation
- Deterministic behavior and artifacts

## Actionable Task Map

1. Create `tests/evals/lifecycle-tokens/providers/`
2. Define registry contract and validator
3. Add Claude, Codex, and OpenCode wrapper entries
4. Add unavailable-provider handling
5. Add tests for ordering, validation, and missing wrappers

## Acceptance Criteria

- Registry returns Claude Code, Codex, and OpenCode in deterministic order
- Unavailable providers remain present with `is_available = false`
- Unavailable providers carry an explicit machine-readable `availability_reason`
- Invalid wrappers are rejected
- Duplicate provider ids are rejected
