# Implementation Plan: Codex Live Runner

> **Methodology:** adev
> **Charter:** .context-index/specs/features/token-observability/charter.md
> **Spec:** .context-index/specs/features/token-observability/codex-live-runner.md
> **Review:** PASS_WITH_NOTES (2026-03-26)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Implement a real Codex live-eval phase runner that can execute lifecycle phases non-interactively, return allowlisted provider-native results, and integrate with the existing token observability live harness.

**Architecture:** The implementation stays inside `tests/evals/lifecycle-tokens/` and extends the existing live-provider boundary instead of changing downstream orchestration or reporting contracts. A new Codex-specific runner module owns non-interactive Codex invocation, context-to-request shaping, structured result extraction, artifact persistence, and deterministic failure mapping; the existing `tests/evals/lifecycle-tokens/providers/codex.mjs` wrapper continues to load that runner through `ADEV_LIFECYCLE_PROVIDER_CODEX_RUNNER`, and the shared normalizer remains the only downstream schema boundary.

---

## File Structure

**Create:**
- `tests/evals/lifecycle-tokens/providers/codex-runner.mjs`
- `tests/evals/lifecycle-tokens/providers/codex-runner.test.mjs`

**Modify:**
- `tests/evals/lifecycle-tokens/providers/codex.mjs`
- `tests/evals/lifecycle-tokens/providers/registry.test.mjs`
- `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`
- `package.json`

**Reference (read, do not modify unless required):**
- `.context-index/constitution.md`
- `.context-index/orientation/architecture.md`
- `.context-index/specs/features/token-observability/charter.md`
- `.context-index/specs/features/token-observability/codex-live-runner.md`
- `.context-index/specs/features/token-observability/codex-live-runner.review.md`
- `.context-index/specs/features/token-observability/live-provider-execution.md`
- `.context-index/specs/features/token-observability/provider-result-normalization.md`
- `providers/codex/adapter.mjs`
- `tests/evals/lifecycle-tokens/providers/normalize-result.mjs`
- `tests/evals/lifecycle-tokens/run-live-eval.mjs`

## Constitution Validation

- No new external dependencies are needed; use Node.js built-ins such as `child_process`, `fs`, `path`, and `os`.
- All implementation remains pure ESM (`.mjs`).
- No hook protocol, CLI install path, or plugin registration contracts are changed.
- This plan does not require human approval under the current constitution.

## Specialist Routing

- `specialists: []` in `.context-index/manifest.yaml`
- All tasks route as `[specialist: none]`

## Context Packets

### Task 1 Context
- Spec: `codex-live-runner.md`
- Review: `codex-live-runner.review.md`
- Existing wrapper: `tests/evals/lifecycle-tokens/providers/codex.mjs`
- Existing provider detection: `providers/codex/adapter.mjs`

### Task 2 Context
- Specs: `codex-live-runner.md`, `provider-result-normalization.md`
- Existing shared boundary: `tests/evals/lifecycle-tokens/providers/normalize-result.mjs`
- Existing live runner: `tests/evals/lifecycle-tokens/run-live-eval.mjs`

### Task 3 Context
- Spec: `codex-live-runner.md`
- Existing tests: `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`, `tests/evals/lifecycle-tokens/providers/registry.test.mjs`
- Quality gate: `npm test`

## Parallelization

- Group A: Task 1 → Task 2 → Task 3
- Keep execution serial because the wrapper contract and CLI hook-up depend on the runner interface, and the end-to-end validation depends on both.

---

### Task 1: Define Codex Runner Boundary [specialist: none]

**Files:** Create: `tests/evals/lifecycle-tokens/providers/codex-runner.mjs`; Modify: `tests/evals/lifecycle-tokens/providers/codex.mjs`; Test: `tests/evals/lifecycle-tokens/providers/codex-runner.test.mjs`, `tests/evals/lifecycle-tokens/providers/registry.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Export a concrete `runPhase(context)` entrypoint for Codex live eval use
- Define the exact runner input boundary from the eval harness context
- Define the allowlisted provider-native result boundary expected by shared normalization
- Keep `tests/evals/lifecycle-tokens/providers/codex.mjs` as the env-driven wrapper and point it at the new runner by default when appropriate
- Preserve deterministic availability behavior and explicit configuration reasons

### Task 2: Implement Safe Invocation And Result Extraction [specialist: none]

**Files:** Modify: `tests/evals/lifecycle-tokens/providers/codex-runner.mjs`; Test: `tests/evals/lifecycle-tokens/providers/codex-runner.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Invoke Codex non-interactively through argv/stdin-based execution rather than shell interpolation
- Normalize or escape authored phase inputs before handing them to the provider process
- Capture stdout, stderr, exit status, and structured output deterministically
- Parse Codex output into the allowlisted provider-result shape: `status`, optional `triggerType`, optional `modelId`, optional `reasonCode`, optional `artifactPaths`, optional `tokenUsage`, optional `subagentRuns`
- Define fallback behavior for partial delegation data: omit subagent rows unless linkage and role data are representable losslessly
- Reject or redact secrets and environment-derived credentials from persisted artifacts
- Enforce canonical artifact-root containment, including resolved-path and symlink-traversal checks
- Map parse, contract, and runtime failures to deterministic reason codes

### Task 3: Integrate And Validate Live Codex Execution [specialist: none]

**Files:** Modify: `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`, `package.json`; Test: `tests/evals/lifecycle-tokens/providers/codex-runner.test.mjs`, `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Verify the live harness can execute the Codex provider through the real runner module path
- Verify successful runs preserve `provider_id`, `model_id`, token fields, and artifact paths through the existing live runner
- Verify configuration, unavailable-runtime, parse-failure, timeout, and unmappable-result paths mark only the affected provider-scenario run
- Verify package scripts and wrapper defaults still expose the intended live eval entrypoints
- Verify the integrated workflow still passes the lifecycle token harness and repo quality gates

## Acceptance Coverage

- Task 1 covers the configurable runner module boundary and the exact `runPhase(context)` contract
- Task 2 covers deterministic invocation, allowlisted result extraction, partial-subagent fallback, secret-safe artifacts, and deterministic failure mapping
- Task 3 covers harness integration and end-to-end live Codex validation

## Validation Commands

- `node --test tests/evals/lifecycle-tokens/providers/codex-runner.test.mjs`
- `node --test tests/evals/lifecycle-tokens/providers/*.test.mjs`
- `node --test tests/evals/lifecycle-tokens/run-live-eval.test.mjs`
- `npm run eval:lifecycle-tokens:live`
- `npm test`
