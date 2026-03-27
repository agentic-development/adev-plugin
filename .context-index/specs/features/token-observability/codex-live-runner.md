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
- A fixture workspace root is available for the selected fixture profile
- The local environment can invoke Codex in non-interactive mode, or the runner can detect and report why it cannot
- The shared provider-result normalization contract in `provider-result-normalization.md` remains the downstream boundary

### Behaviors

1. **When** the Codex provider wrapper is configured for live eval execution **then** it loads a Codex-specific runner module through `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER` and uses that module as the only source of provider-native phase results.
2. **When** the Codex runner starts one phase execution **then** it receives the canonical eval context from the harness, including scenario id, phase id, phase name, skill name, attempt, `run_id`, and artifact root, and it preserves that context across the full provider call.
3. **When** the live eval is invoked without an explicit fixture selection **then** the Codex runner defaults to a named baseline fixture profile backed by `tests/fixtures/sample-project`.
4. **When** the live eval is invoked with a fixture selection option **then** the runner resolves one named fixture profile and copies only that fixture workspace into its scratch execution directory instead of evaluating the adev-plugin repository itself.
5. **When** fixture profiles are defined **then** each profile declares a stable `fixture_id`, human-readable name, fixture root path, and one complexity class such as `small`, `medium`, or `large` so reports can compare project-complexity bands deterministically.
6. **When** the Codex runner invokes Codex for one lifecycle phase **then** it constructs a deterministic non-interactive request that frames the task as real fixture-backed lifecycle work for the selected fixture project, including the phase objective, fixture identity, lifecycle context, and any authored eval instructions needed for that phase.
7. **When** the selected fixture profile is intended for behavioral measurement **then** the prompt must allow realistic phase behavior, including subagent fan-out for `review-specs`, instead of collapsing the phase into repo-state classification.
8. **When** Codex completes successfully **then** the runner returns one provider-native phase result object containing terminal `status`, optional `trigger_type`, `model_id` when known, token metadata when known, and any path-contained artifacts required for later inspection.
9. **When** Codex emits usage fields in provider-native names or nested structures **then** the runner maps only the supported token, model, reason, artifact, and subagent fields into the allowlisted provider-result shape expected by the shared normalizer, rather than leaking raw provider payloads downstream.
10. **When** Codex cannot supply some token fields **then** the runner omits those fields and relies on shared normalization to mark them explicitly as `unknown` instead of estimating or synthesizing token counts.
11. **When** one lifecycle phase causes Codex to delegate work or return role-scoped agent activity **then** the runner emits those results as linked subagent entries only if the linkage, role, status, and token fields can be represented losslessly in the shared provider-result contract.
12. **When** Codex exits with a deterministic lifecycle outcome, such as success, review rejection, recoverable failure, or incomplete execution **then** the runner maps that outcome into the canonical status and reason fields used by the existing scenario graph and reporting flow.
13. **When** the Codex invocation writes transcripts, JSON output, or other diagnostics **then** the runner stores only the artifacts needed for eval inspection inside the provided artifact root and returns relative artifact paths that remain contained within that root.
14. **When** the selected fixture profile cannot support the requested scenario or behavioral mode **then** the runner fails explicitly with a deterministic fixture-configuration reason instead of silently falling back to repo-state classification.
15. **When** Codex is unavailable, misconfigured, returns malformed output, exceeds the runner contract, or cannot be parsed into the allowlisted provider-result shape **then** the runner fails explicitly with deterministic reason codes so the live harness can mark only the affected provider-scenario run as `failed` or `incomplete`.

### Postconditions

- One Codex phase execution produces either one provider-native phase result or one explicit deterministic failure
- Each Codex phase execution is scoped to one resolved fixture profile rather than the adev-plugin repository root
- Successful Codex runs return a provider-native result object that the shared normalizer can consume without Codex-specific downstream branches
- Returned token metadata, model metadata, subagent metadata, and artifact paths remain scoped to the allowlisted provider-result contract
- Missing token fields remain explicit through shared normalization rather than being recomputed by the runner
- All returned artifact paths remain contained within the eval artifact root
- One Codex failure does not require changes to the broader live-provider orchestration contract
- Reports can group and compare runs by fixture complexity class

### Error Cases

| Condition | Expected Behavior | HTTP Status / Error Code |
|-----------|-------------------|--------------------------|
| `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER` is unset | Codex provider remains explicitly unavailable to live eval and reports a deterministic configuration reason | `provider_runner_not_configured` |
| Fixture profile id is unknown | Runner fails before invocation with deterministic fixture configuration error | `unknown_fixture_profile` |
| Fixture root is missing or unreadable | Runner fails before invocation with deterministic fixture configuration error | `invalid_fixture_root` |
| Fixture profile does not support requested behavioral mode or scenario | Runner fails explicitly rather than silently changing execution style | `unsupported_fixture_mode` |
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
| Fixture profile registry | Define named fixture profiles with stable ids, root paths, and complexity classes starting with `tests/fixtures/sample-project` as the baseline | medium |
| Request shaping | Define the deterministic phase input and non-interactive Codex invocation contract for fixture-backed behavioral execution | medium |
| Result extraction | Parse Codex output into the allowlisted provider-result shape expected by shared normalization | medium |
| Artifact handling | Persist transcripts or diagnostics inside the eval artifact root and return contained relative paths | medium |
| Failure mapping | Convert configuration, runtime, parse, and contract failures into deterministic reason codes | medium |
| Validation tests | Add fake-process and malformed-output tests covering fixture resolution, complexity labeling, success, unknown tokens, and parse failures | medium |

## Acceptance Criteria

- [ ] A Codex runner module can be configured through `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER`
- [ ] Live Codex eval accepts a fixture selection option and defaults to a baseline fixture profile
- [ ] The baseline fixture profile uses `tests/fixtures/sample-project`
- [ ] Fixture profiles expose a stable complexity class so reports can compare small, medium, and large projects
- [ ] One phase execution receives canonical lifecycle context and returns one provider-native result object on success
- [ ] One phase execution runs against the selected fixture workspace rather than the adev-plugin repository root
- [ ] Returned Codex results fit the shared provider-result normalization contract without downstream Codex-specific parsing
- [ ] Known token fields and `model_id` are preserved exactly when Codex exposes them
- [ ] Missing token fields remain omitted so shared normalization can mark them as `unknown`
- [ ] Behavioral fixture mode preserves real `review-specs` subagent activity when Codex emits it and the shared contract can represent it losslessly
- [ ] Artifact paths returned by the runner are contained within the eval artifact root
- [ ] Unknown or invalid fixture selections fail with deterministic fixture configuration reason codes
- [ ] Configuration, parse, and contract failures map to deterministic reason codes
- [ ] The live lifecycle matrix can run Codex without aborting other providers or scenarios when one Codex phase fails
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
