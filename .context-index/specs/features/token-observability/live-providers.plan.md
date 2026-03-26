# Implementation Plan: Token Observability Live Providers

> **Methodology:** adev
> **Charter:** .context-index/specs/features/token-observability/charter.md
> **Specs:** .context-index/specs/features/token-observability/provider-wrapper-registry.md, .context-index/specs/features/token-observability/provider-result-normalization.md, .context-index/specs/features/token-observability/live-provider-execution.md, .context-index/specs/features/token-observability/cross-provider-reporting.md
> **Review:** PASS (2026-03-26)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Extend the existing lifecycle token eval harness to run the same scenarios through Claude Code, Codex, and OpenCode, normalize provider-native results into the canonical event schema, and emit deterministic cross-provider reporting artifacts.

**Architecture:** The implementation stays inside `tests/evals/lifecycle-tokens/` and reuses the existing scenario registry, capture, orchestration, and reporting modules. A new live-provider layer wraps the repo's existing provider adapters behind eval-safe provider wrappers, executes one provider-scenario run in an isolated child-process boundary, normalizes provider-native output into the canonical token event contract, and extends reporting with provider-scoped run artifacts plus `CROSS_PROVIDER.md`.

---

## File Structure

**Create:**
- `tests/evals/lifecycle-tokens/providers/registry.mjs`
- `tests/evals/lifecycle-tokens/providers/registry.test.mjs`
- `tests/evals/lifecycle-tokens/providers/normalize-result.mjs`
- `tests/evals/lifecycle-tokens/providers/normalize-result.test.mjs`
- `tests/evals/lifecycle-tokens/providers/claude-code.mjs`
- `tests/evals/lifecycle-tokens/providers/codex.mjs`
- `tests/evals/lifecycle-tokens/providers/opencode.mjs`
- `tests/evals/lifecycle-tokens/run-live-eval.mjs`
- `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`

**Modify:**
- `tests/evals/lifecycle-tokens/capture.mjs`
- `tests/evals/lifecycle-tokens/capture.test.mjs`
- `tests/evals/lifecycle-tokens/run-orchestration.mjs`
- `tests/evals/lifecycle-tokens/run-orchestration.test.mjs`
- `tests/evals/lifecycle-tokens/run-eval.mjs`
- `tests/evals/lifecycle-tokens/report.mjs`
- `tests/evals/lifecycle-tokens/report.test.mjs`
- `package.json`

**Reference (read, do not modify unless required):**
- `.context-index/constitution.md`
- `.context-index/orientation/architecture.md`
- `.context-index/specs/features/token-observability/charter.md`
- `.context-index/specs/features/token-observability/scenario-registry.md`
- `.context-index/specs/features/token-observability/phase-token-capture.md`
- `.context-index/specs/features/token-observability/run-orchestration.md`
- `.context-index/specs/features/token-observability/scenario-reporting.md`
- `lib/provider/registry.mjs`
- `lib/provider/interface.mjs`
- `providers/claude-code/adapter.mjs`
- `providers/codex/adapter.mjs`
- `providers/opencode/adapter.mjs`

## Constitution Validation

- No new external dependencies are needed. Use Node.js built-ins for subprocess isolation, timeouts, path containment, and filesystem writes.
- All new implementation files must stay ESM (`.mjs`).
- This plan does not change plugin registration, CLI installation paths, or hook protocol contracts.
- No task requires human approval under the current constitution.

## Specialist Routing

- `specialists: []` in `.context-index/manifest.yaml`
- All tasks route as `[specialist: none]`

## Context Packets

### Task 1 Context
- Specs: `provider-wrapper-registry.md`, `live-provider-execution.md`
- Review reports: `provider-wrapper-registry.review.md`, `live-provider-execution.review.md`
- Existing provider surface: `lib/provider/registry.mjs`, `providers/*/adapter.mjs`

### Task 2 Context
- Specs: `provider-result-normalization.md`, `phase-token-capture.md`
- Review reports: `provider-result-normalization.review.md`
- Existing capture code: `tests/evals/lifecycle-tokens/capture.mjs`

### Task 3 Context
- Specs: `live-provider-execution.md`, `run-orchestration.md`
- Existing runner: `tests/evals/lifecycle-tokens/run-orchestration.mjs`, `tests/evals/lifecycle-tokens/run-eval.mjs`
- Existing tests: `tests/evals/lifecycle-tokens/run-orchestration.test.mjs`

### Task 4 Context
- Specs: `cross-provider-reporting.md`, `scenario-reporting.md`
- Existing reporting code: `tests/evals/lifecycle-tokens/report.mjs`, `tests/evals/lifecycle-tokens/report.test.mjs`

### Task 5 Context
- All live-provider specs and review reports
- All harness modules under `tests/evals/lifecycle-tokens/`
- Quality gate command: `npm test`

## Parallelization

- Group A: Task 1 → Task 2 → Task 3 → Task 4 → Task 5
- Keep execution serial because normalization, orchestration, and reporting depend on the provider registry contract and shared run metadata.

---

### Task 1: Provider Wrapper Registry [specialist: none]

**Files:** Create: `tests/evals/lifecycle-tokens/providers/registry.mjs`, `tests/evals/lifecycle-tokens/providers/claude-code.mjs`, `tests/evals/lifecycle-tokens/providers/codex.mjs`, `tests/evals/lifecycle-tokens/providers/opencode.mjs`; Test: `tests/evals/lifecycle-tokens/providers/registry.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Load provider entries in deterministic order: `claude-code`, `codex`, `opencode`
- Expose `provider_id`, capability flags, `is_available`, machine-readable `availability_reason`, and `runPhase(...)`
- Distinguish explicit unavailability from unexpected import or initialization failure
- Reuse existing provider adapters without modifying the top-level provider registry contract
- Reject duplicate ids and invalid wrapper contracts

### Task 2: Provider Result Normalization [specialist: none]

**Files:** Create: `tests/evals/lifecycle-tokens/providers/normalize-result.mjs`; Modify: `tests/evals/lifecycle-tokens/capture.mjs`, `tests/evals/lifecycle-tokens/run-orchestration.mjs`; Test: `tests/evals/lifecycle-tokens/providers/normalize-result.test.mjs`, `tests/evals/lifecycle-tokens/capture.test.mjs`, `tests/evals/lifecycle-tokens/run-orchestration.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Normalize provider-native phase results into the canonical event contract used by `phase-token-capture`
- Preserve canonical identity and ordering fields: `run_id`, `scenario_id`, `event_id`, `event_index`, `actor_type`, `phase_id`, `phase_name`, `skill_name`, `attempt`, `status`
- Emit linked subagent records with `parent_phase_event_id` and `subagent_role`
- Keep provider-run metadata as a run-scoped sidecar unless already part of the canonical event schema
- Assign ordered event generation to the orchestration pipeline so both fixture and live modes emit the same canonical event shape
- Enforce artifact-root containment, token-total consistency, allowlisted metadata classes, and invalid-payload rejection

### Task 3: Live Provider Execution Runner [specialist: none]

**Files:** Create: `tests/evals/lifecycle-tokens/run-live-eval.mjs`; Modify: `tests/evals/lifecycle-tokens/run-orchestration.mjs`, `tests/evals/lifecycle-tokens/run-eval.mjs`, `package.json`; Test: `tests/evals/lifecycle-tokens/run-orchestration.test.mjs`, `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Keep `npm run eval:lifecycle-tokens` as the deterministic fixture harness entrypoint
- Add a separate live-provider entrypoint such as `npm run eval:lifecycle-tokens:live`
- Execute one provider-scenario run in an isolated child-process or worker boundary
- Preserve `run_id`, `provider_id`, `model_id`, terminal status, and deterministic reason codes
- Route provider-native output through shared normalization before capture or reporting
- Enforce timeout, payload-limit, force-termination, and cleanup semantics without aborting the rest of the matrix
- Represent unavailable providers as explicit `incomplete` runs with provider-availability reason codes

### Task 4: Provider-Scoped And Cross-Provider Reporting [specialist: none]

**Files:** Modify: `tests/evals/lifecycle-tokens/report.mjs`, `tests/evals/lifecycle-tokens/run-live-eval.mjs`; Test: `tests/evals/lifecycle-tokens/report.test.mjs`, `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Switch provider-scoped scenario reports to `reports/<run-id>.md`
- Keep `ROLLUP.md` as the scenario-matrix summary for one invocation
- Add and test the spec-required phase-rankings section in `ROLLUP.md` while extending reporting for live-provider mode
- Add deterministic `CROSS_PROVIDER.md` for live invocations only
- Use explicit invocation metadata from the live entrypoint to decide when cross-provider reporting is enabled
- Compare only like-for-like scenario ids across providers
- Sort known totals before unknown totals and use `provider_id` as deterministic tie-breaker
- Surface incomplete or failed runs, unknown-coverage gaps, and rule-based integration findings in `CROSS_PROVIDER.md`
- Escape or normalize provider ids, model ids, reason codes, and findings before Markdown output

### Task 5: End-to-End Live Provider Validation [specialist: none]

**Files:** Test: `tests/evals/lifecycle-tokens/run-live-eval.test.mjs`, `tests/evals/lifecycle-tokens/report.test.mjs`

- [ ] **Write failing test**
- [ ] **Verify test fails**
- [ ] **Implement**
- [ ] **Verify test passes**
- [ ] **Commit**

**TDD scope**
- Run the full lifecycle matrix against deterministic fake provider wrappers for all three providers
- Verify unavailable-provider, malformed-payload, timeout, and partial-token cases do not abort the invocation
- Verify raw `.jsonl` logs, provider-scoped `<run-id>.md` reports, `ROLLUP.md`, and `CROSS_PROVIDER.md` are produced deterministically
- Verify cross-provider reporting uses canonical run data when a provider-scoped report is missing
- Verify both `npm run eval:lifecycle-tokens` and the new live entrypoint script resolve to the intended runner files
- Verify the integrated workflow still passes the existing lifecycle token harness expectations

## Acceptance Coverage

- Task 1 covers provider-wrapper-registry acceptance criteria
- Task 2 covers provider-result-normalization acceptance criteria
- Task 3 covers live-provider-execution acceptance criteria
- Task 4 covers cross-provider-reporting acceptance criteria and the updated scenario-reporting artifact split
- Task 5 verifies the integrated live-provider workflow end to end

## Validation Commands

- `node --test tests/evals/lifecycle-tokens/providers/*.test.mjs`
- `node --test tests/evals/lifecycle-tokens/*.test.mjs`
- `npm run eval:lifecycle-tokens`
- `npm run eval:lifecycle-tokens:live`
- `npm test`
