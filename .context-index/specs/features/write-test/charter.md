---
status: approved
revision: 1
updated: 2026-03-27
---

# Feature Charter: adev:write-test

<!-- Feature Charter for the adev:write-test module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

`adev:write-test` is a specialist skill that owns test integrity across the TDD cycle. It addresses the three most common agent testing failures: specification gaming (writing tests designed to pass rather than to verify behavior), over-mocking (replacing real systems with scaffolding that hides integration failures), and blame deflection (claiming test failures are pre-existing without proof). It does this by separating test authorship from implementation — tests are written by a dedicated agent with strict rules, locked in an immutable handoff block, and verified after the GREEN phase to ensure the implementer did not quietly weaken them.

## Scope and Boundaries

### In Scope

- Writing failing tests (RED phase) for a given spec, function, or free-form behavioral description
- Enforcing mocking boundary rules: mock only external system boundaries (HTTP, DB, filesystem, external APIs), never internal application logic
- Producing an immutable handoff block with test files, verification commands, and locked test constraints
- Running the git stash pre-existing failure protocol when failures are present before the RED phase begins
- Verifying (post-GREEN) that the implementer did not change test semantics against the handoff block
- Detecting specification gaming patterns: hardcoded return values mirroring assertions, vacuous matchers (`toBeTruthy`, `>= 0`, `toBeDefined` as sole assertion), conditional skips, unseeded assertions
- Selecting the appropriate model tier (`capable` for authoring, `fast` for verification and judgment) resolved from the project's `platform-context.yaml`

### Out of Scope

- Writing production code (GREEN phase — owned by `adev:implement`'s implementer subagent)
- Refactoring (REFACTOR phase — owned by the code quality reviewer in `adev:implement`)
- Full TDD orchestration (dispatching implementers, managing task lifecycle — owned by `adev:implement`)
- Running the full quality gate suite (owned by `adev:validate`)
- Scoring test quality with graduated metrics (owned by `adev:eval` Layer 2)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `adev:implement` | Internal skill | Dispatches this skill at RED phase and post-GREEN verify; provides task context and spec path |
| Live Specs | File read | `.context-index/specs/features/<module>/*.md` — acceptance criteria used to derive test contracts |
| Constitution | File read | `.context-index/constitution.md` — coding standards and mocking boundary rules |
| `platform-context.yaml` | File read | Project's `.context-index/platform-context.yaml` — resolves `model_tiers` for subagent dispatch |
| `.context-index/packets/` | File write | Shared directory for handoff blocks and context packets |
| Git CLI | External tool | `git stash` / `git stash pop` for the pre-existing failure protocol |
| Test runner | External tool | Framework-detected command to verify RED state and run stash protocol checks |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Handoff Block | Immutable record of the RED phase output, written to `.context-index/packets/<slug>-tests.md` | test files, verification command, failure summary, locked constraints, content hash |
| Test Contract | The behavioral assertions a test makes, derived from acceptance criteria | assertions, matchers, seed data, scope (unit / integration / e2e) |
| Mocking Boundary | A declared external system boundary where mocking is permitted | type (HTTP / DB / filesystem / external API), justification |
| Pre-existing Failure Record | Proof that a test failure predated the current changes | stash SHA, test output before stash pop, test output after stash pop |
| Gaming Violation | A detected instance of specification gaming in a test | pattern (hardcoded value / vacuous matcher / conditional skip / unseeded assertion), file location, severity |

### Relationships

- A Handoff Block contains one or more Test Contracts
- A Test Contract references zero or more Mocking Boundaries (each must be justified)
- A Pre-existing Failure Record is attached to a Handoff Block when failures existed before the RED phase began
- Gaming Violations are detected during both authorship (RED) and verification (post-GREEN)

### Invariants

- A Handoff Block's content hash must match the test files on disk at verify time — any mismatch is a semantic tampering violation
- Every mock in a test must reference a declared Mocking Boundary — mocking without a declared boundary is a violation
- A test with a vacuous matcher as its sole assertion is always a Gaming Violation, regardless of context
- A Pre-existing Failure Record is required before proceeding if any test fails at the start of RED phase
- `git stash pop` must always execute — even if the test run errors — to avoid corrupting the working tree

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| RED Phase Test Authoring | Write failing tests from a spec or behavioral description. Enforce mocking boundaries, seed data requirements, and strict assertion rules. Verify RED state before producing handoff. | Must-have |  | review-passed |
| Immutable Handoff Block | Produce a locked record of test files, verification command, failure summary, and content hash. Written to `.context-index/packets/`. | Must-have |  | review-passed |
| Pre-existing Failure Protocol | Before authoring, run `git stash` + test run + `git stash pop` if any tests are failing. Attach proof record to handoff block. Block if proof cannot be produced. | Must-have |  | review-passed |
| Post-GREEN Semantic Verification | Re-invoked after implementer completes GREEN phase. Diff current tests against handoff block. Report semantic tampering violations. | Must-have |  | review-passed |
| Gaming Violation Detection | During authorship and verification, detect hardcoded return values, vacuous matchers, conditional skips, and unseeded assertions. Block on detection. Deterministic patterns detected via `.mjs` helper without LLM. | Must-have |  | review-passed |
| Standalone Invocation | Accept a file path, function signature, or free-form behavioral description as input (not just a spec path). Fully usable outside `adev:implement`. | Must-have |  | review-passed |
| Mocking Boundary Declaration | Require explicit justification for every mock. Produce a boundary manifest in the handoff block. Flag any mock targeting internal application logic. | Must-have |  | review-passed |
| Framework Detection | Detect the test framework from `package.json` or existing test files (`node:test`, jest, vitest, pytest, etc.) and generate idiomatic test code. Implemented as a `.mjs` helper — no LLM required. | Must-have |  | review-passed |
| Handoff Block Diff Report | On verify failure, produce a human-readable diff showing exactly which assertions were weakened, removed, or had matchers loosened. | Must-have |  | review-passed |
| Model Selection | Dispatch each phase with the appropriate model tier: `capable` for RED authoring, `fast` for verification and gaming judgment. Tiers resolved from `model_tiers` in the project's `platform-context.yaml`. Falls back to `capable` if a tier is unset. | Must-have |  | review-passed |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev:write-test --red` | Skill invocation | RED phase entry point. Accepts `--spec <path>`, `--file <path>`, or free-form description. Produces handoff block at `.context-index/packets/<slug>-tests.md`. |
| `adev:write-test --verify` | Skill invocation | Post-GREEN entry point. Accepts `--packet <path>` pointing to the handoff block. Diffs current tests against locked constraints. Returns PASS or TAMPERED report. |
| Handoff Block | File artifact | Written to `.context-index/packets/<slug>-tests.md`. Consumed by `adev:implement`'s implementer subagent and by `--verify` mode. |
| Pre-existing Failure Record | File artifact (embedded in handoff block) | Proof of pre-change test state. Consumed by `adev:implement` for audit trail and by `/adev:retro` for trend analysis. |

### Consumed APIs

| Interface | Source | Description |
|-----------|--------|-------------|
| Live Spec | `.context-index/specs/` | Acceptance criteria used to derive Test Contracts. Optional when invoked standalone with a file or description. |
| Constitution | `.context-index/constitution.md` | Mocking boundary rules and coding standards. |
| `model_tiers` | `.context-index/platform-context.yaml` | Resolves abstract tier names to concrete model IDs for subagent dispatch. |
| `packets/` directory | `.context-index/packets/` | Shared write location for handoff blocks. |
| Git CLI | External | `git stash` / `git stash pop` for the pre-existing failure protocol. |
| Test runner | External | Framework-detected command (e.g. `node --test`, `npx jest`, `pytest`) to verify RED state. |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Token efficiency | RED phase dispatches `capable` tier only for test authoring. All other phases use `fast` tier or no model. Deterministic checks (gaming detection, framework detection) run as `.mjs` helpers without any LLM call. |
| Model portability | Skill never references a specific model name. All model IDs resolved from `model_tiers` in the project's `platform-context.yaml`. Compatible with any provider (Claude, OpenAI, Gemini, etc.). |
| Working tree safety | The git stash protocol must always run `git stash pop` — even if the test run fails or errors. A failed pop blocks the skill entirely and reports the stash SHA for manual recovery. |
| Idempotency | Re-running `--red` on the same target overwrites the previous handoff block. Re-running `--verify` on the same packet is safe and produces a fresh report. |
| Failure explicitness | Every violation (gaming, tampered test, undeclared mock, unproven pre-existing failure) produces a named, structured error with file location and violation type. The skill never silently passes. |
| Framework agnosticism | Works with any test framework detectable from `package.json` or existing test files. Generates idiomatic output per detected framework. |
| Auditability | Handoff blocks persist in `.context-index/packets/` after the session. Pre-existing failure records are embedded in handoff blocks for retrospective review via `/adev:retro`. |
