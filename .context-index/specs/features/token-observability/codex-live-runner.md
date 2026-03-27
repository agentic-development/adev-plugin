# Live Spec: codex-live-runner

<!-- Live Spec within the token-observability charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/token-observability/charter.md -->

---
charter: token-observability
status: draft
risk_level: medium
milestone: v1
created: 2026-03-26
---

## Behavioral Contract

### Preconditions

- The live lifecycle eval harness has selected the Codex provider wrapper for one phase execution
- A valid lifecycle scenario, phase definition, `run_id`, and attempt number are available
- The eval artifact root is writable and path-contained
- The local environment can invoke Codex in non-interactive mode, or the runner can detect and report why it cannot
- The shared provider-result normalization contract in `provider-result-normalization.md` remains the downstream boundary

### Behaviors

1. **When** the Codex provider wrapper is configured for live eval execution **then** it loads a Codex-specific runner module through `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER` and uses that module as the only source of provider-native phase results.
2. **When** the Codex runner starts one phase execution **then** it receives the canonical eval context from the harness, including scenario id, phase id, phase name, skill name, attempt, `run_id`, and artifact root, and it preserves that context across the full provider call.
3. **When** the Codex runner invokes Codex for one lifecycle phase **then** it constructs a deterministic non-interactive request that includes the phase objective, the current lifecycle context, and any phase-specific authored inputs needed for the eval, without depending on ad hoc terminal interaction.
4. **When** Codex completes successfully **then** the runner returns one provider-native phase result object containing terminal `status`, optional `trigger_type`, `model_id` when known, token metadata when known, and any path-contained artifacts required for later inspection.
5. **When** Codex emits usage fields in provider-native names or nested structures **then** the runner maps only the supported token, model, reason, artifact, and subagent fields into the allowlisted provider-result shape expected by the shared normalizer, rather than leaking raw provider payloads downstream.
6. **When** Codex cannot supply some token fields **then** the runner omits those fields and relies on shared normalization to mark them explicitly as `unknown` instead of estimating or synthesizing token counts.
7. **When** one lifecycle phase causes Codex to delegate work or return role-scoped agent activity **then** the runner emits those results as linked subagent entries only if the linkage, role, status, and token fields can be represented losslessly in the shared provider-result contract.
8. **When** Codex exits with a deterministic lifecycle outcome, such as success, review rejection, recoverable failure, or incomplete execution **then** the runner maps that outcome into the canonical status and reason fields used by the existing scenario graph and reporting flow.
9. **When** the Codex invocation writes transcripts, JSON output, or other diagnostics **then** the runner stores only the artifacts needed for eval inspection inside the provided artifact root and returns relative artifact paths that remain contained within that root.
10. **When** Codex is unavailable, misconfigured, returns malformed output, exceeds the runner contract, or cannot be parsed into the allowlisted provider-result shape **then** the runner fails explicitly with deterministic reason codes so the live harness can mark only the affected provider-scenario run as `failed` or `incomplete`.

### Postconditions

- One Codex phase execution produces either one provider-native phase result or one explicit deterministic failure
- Successful Codex runs return a provider-native result object that the shared normalizer can consume without Codex-specific downstream branches
- Returned token metadata, model metadata, subagent metadata, and artifact paths remain scoped to the allowlisted provider-result contract
- Missing token fields remain explicit through shared normalization rather than being recomputed by the runner
- All returned artifact paths remain contained within the eval artifact root
- One Codex failure does not require changes to the broader live-provider orchestration contract

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|-----------|-------------------|--------------------------|
| `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER` is unset | Codex provider remains explicitly unavailable to live eval and reports a deterministic configuration reason | `provider_runner_not_configured` |
| Codex binary or non-interactive runtime is unavailable | Runner returns explicit provider-availability failure without pretending the phase ran | `provider_not_installed` |
| Codex command exits without a parseable structured result | Runner fails the phase explicitly and preserves any partial artifacts already written | `provider_output_unparseable` |
| Codex returns output that cannot be mapped into the allowlisted provider-result contract | Runner fails the phase with normalization-compatible failure rather than forwarding raw output | `provider_result_unmappable` |
| Runner emits artifact path outside eval root | Runner rejects the artifact and fails the phase | `unsafe_artifact_path` |
| Runner reports inconsistent token totals | Shared normalization rejects the payload and the phase fails explicitly | `invalid_token_payload` |
| Codex invocation exceeds the live harness timeout | Harness force-terminates the worker and records the run as incomplete | `provider_timeout` |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because the runner should rely on existing local Codex capabilities and Node.js built-ins rather than adding new libraries for orchestration.
- **Principle:** "Pure ESM" — Applies because the runner and any helper modules must fit the existing `.mjs` eval boundary.
- **Principle:** "Deterministic behavior and artifacts" — Applies because the runner must map Codex outcomes into stable reason codes, artifact paths, and provider-result fields.
- **Principle:** "Eval-boundary isolation" — Applies because Codex execution, artifacts, and failures must remain inside `tests/evals/lifecycle-tokens/` and must not affect normal plugin behavior.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Runner entrypoint | Create a Codex runner module that exports `runPhase(context)` for live eval use | medium |
| Request shaping | Define the deterministic phase input and non-interactive Codex invocation contract | medium |
| Result extraction | Parse Codex output into the allowlisted provider-result shape expected by shared normalization | medium |
| Artifact handling | Persist transcripts or diagnostics inside the eval artifact root and return contained relative paths | medium |
| Failure mapping | Convert configuration, runtime, parse, and contract failures into deterministic reason codes | medium |
| Validation tests | Add fake-process and malformed-output tests covering success, unknown tokens, and parse failures | medium |

## Acceptance Criteria

- [ ] A Codex runner module can be configured through `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER`
- [ ] One phase execution receives canonical lifecycle context and returns one provider-native result object on success
- [ ] Returned Codex results fit the shared provider-result normalization contract without downstream Codex-specific parsing
- [ ] Known token fields and `model_id` are preserved exactly when Codex exposes them
- [ ] Missing token fields remain omitted so shared normalization can mark them as `unknown`
- [ ] Codex subagent activity is emitted only when it can be represented losslessly in the shared contract
- [ ] Artifact paths returned by the runner are contained within the eval artifact root
- [ ] Configuration, parse, and contract failures map to deterministic reason codes
- [ ] The live lifecycle matrix can run Codex without aborting other providers or scenarios when one Codex phase fails
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
