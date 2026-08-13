---
status: evolving
revision: 5
updated: 2026-08-13
---

# Feature Charter: Test Strategies

## Business Intent

Test Strategies provides a strategy abstraction layer that decouples the TDD lifecycle from unit-test assumptions. It defines 12 test strategies (unit, schema, contract, fixture, integration, policy, threshold, visual, smoke, snapshot, reconciliation, tolerance) that the plan, write-test, implement, and validate skills consume to adapt RED-GREEN-REFACTOR semantics to the actual domain of work — whether that's business logic, database migrations, data pipelines, infrastructure-as-code, service integrations, performance requirements, UI components, or **projects whose deliverable is not code at all**.

### Revision 5 — non-code deliverables (issue-558)

The first nine strategies are all code-shaped: each assumes a source file the
agent edits and a test runner that exits non-zero against it. The 2026-08-10
audit found a real project (a data/SQL/YAML migration accelerator) where that
assumption does not hold — 32k LOC of Python, **zero** SQL files, and a
deliverable consisting of YAML configuration landing in gitignored repositories
plus 19k LOC of agent prompts. Because adev had no vocabulary for it, the team
hand-rolled a parallel verification universe: pre-migration ("RED") data
snapshots with SHA-256 checksums, ~2,557 LOC of row-count / schema / profile
reconciliation scripts, a 13-branch drift classifier, and a 391-file
RED/GREEN/VERIFY status ledger.

Two findings drive this revision:

1. **The closest shipped strategies do not fit.** `fixture` assumes a
   hand-crafted input fixture committed next to a transform; the audited project
   compares a *live* pre-state against a *live* post-state where neither side is
   authored. `threshold` is explicitly performance-only — it has no vocabulary
   for "row counts must match within 0.1%".
2. **`test_strategies` was never a real lifecycle path.** The block in
   `templates/manifest-template.yaml` ships entirely commented out, so no
   scaffolded project has ever declared a strategy. Promoting it from comment to
   live schema is part of this revision.

### Revision 5 — decisions of record

- **The lifecycle event log is the status ledger.** No new results store is
  introduced. `.context-index/lifecycle-state/<slug>.jsonl` plus
  `currentState()` / `renderMarkdown()` already provide append-only per-task
  history and a rendered board. A per-task `strategy_verification` event is
  **proposed** (not landed) by `verification-ledger-and-deferred-state.spec.md`;
  adding it to `CANONICAL_EVENTS` is a `[BOUNDARY: human-approved]` change under
  ADR-0009 and must be approved before implementation.
- **"Deferred for credentials" is never a pass.** Verification outcomes are a
  closed enum; `deferred` is a distinct, loud, non-passing state carrying a
  reason code and the specific unmet `infra_requirements` entry, reusing
  `lib/infra-preflight.mjs` rather than inventing a second preflight.
- **Prompt / LLM-output testing is deferred, not omitted.** See Deferred
  Capabilities.

## Scope and Boundaries

### In Scope

- Strategy type definitions (12 strategies: unit, schema, contract, fixture, integration, policy, threshold, visual, smoke, snapshot, reconciliation, tolerance)
- **Non-code deliverables** — strategies whose subject is emitted configuration, migrated data, or a state transition rather than an edited source file
- Strategy detection heuristics (auto-detect from project files and task file paths)
- Manifest schema extension (`test_strategies` section for project-level declaration and overrides), including activating the block in `templates/manifest-template.yaml`
- Strategy assignment protocol (how plan assigns, how spec can override)
- Strategy profile contract (what each profile must define: RED/GREEN semantics, gaming patterns, assertion rules, handoff format)
- Fallback behavior (default to `unit` when no strategy matches or profile is unimplemented)
- **Verification outcome vocabulary** — the closed outcome enum (`red`, `green`, `deferred`, `error`) recorded per task on the lifecycle event log, and the rule that `deferred` never satisfies a GREEN gate

### Out of Scope

- Individual strategy profile implementations (each is a separate Live Spec)
- Test framework detection (already owned by write-test's `detect-framework.sh`)
- Gate tier assignment (owned by tiered-test-gates / unified-gates)
- Test execution and runner orchestration (owned by implement and validate)
- Spec authoring format changes (owned by specify)
- End-to-end verification that an authored suite matches its assigned depth (advisory floor only, no automated enforcement — issue-559)
- **A separate results store, board file, or status-ledger database** — the lifecycle event log serves this role (revision 5 decision of record)
- **LLM-output / prompt quality scoring** — `/adev:eval` already ships an LLM-as-Judge layer; see Deferred Capabilities
- **Snapshot capture tooling** (dump utilities, checksum CLIs) — profiles specify what a valid snapshot must satisfy; producing it is the project's job
- **Editing write-test / implement / validate / hygiene SKILL.md** — the consuming-skill wiring for revision 5 is required follow-up work, tracked per spec in each Module Impact Map

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| manifest.yaml | internal config | Reads `test_strategies` section and `gates` section |
| platform-context.yaml | internal config | Reads `language`, `test_runner`, `framework` for detection heuristics |
| planning | internal module | Plan provides file paths per task for strategy detection |
| design | internal module | Live Specs may declare optional `test_strategy` override in frontmatter |
| tiered-test-gates | internal module | Strategies map to tiers for gate execution |
| unified-gates | internal module | Strategy metadata may be included in gate config |
| governance/risk-policies.yaml | internal config | Reads test_depth per risk level |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| TestStrategy | A named approach to test-first development with domain-specific RED/GREEN semantics | `id` (slug), `name`, `description`, `red_semantics`, `green_semantics`, `gaming_patterns[]`, `assertion_rules`, `handoff_format` |
| StrategyProfile | The full rule set for one strategy, authored as a Live Spec | `strategy_id`, `permitted_tools[]`, `red_exit_condition`, `green_exit_condition`, `gaming_blockers[]`, `assertion_rules`, `seed_data_rule`, `handoff_format` |
| StrategyDeclaration | A project's manifest entry declaring available strategies | `strategy_id`, `command` (test runner), `tier` (fast/integration/e2e), `paths[]` (file globs that trigger this strategy) |
| StrategyAssignment | A task-level binding of strategy to work item | `task_id`, `strategy_id`, `source` (detected/spec-declared/manifest), `confidence` (high/medium/low) |
| TestDepthAssignment | A task-level binding of resolved depth to a plan task | task_id, plan, depth, source, escalated, floor_applied, floor_legs, floor_inputs |
| VerificationOutcome | The recorded result of one strategy verification for one plan task. Persisted as a lifecycle event, not as a separate ledger file. | `task_id`, `strategy_id`, `outcome` (red/green/deferred/error), `reason_code`, `unmet_requirement`, `evidence_ref` |

### Relationships

- A project declares zero or more StrategyDeclarations in manifest.yaml
- Plan produces one StrategyAssignment per task
- Write-test loads the StrategyProfile matching the assignment
- Each StrategyDeclaration maps to exactly one tier in the gate system

### Invariants

- Every StrategyAssignment must resolve to a known strategy ID (one of the 12 defined types)
- If no StrategyProfile exists for an assigned strategy, the `unit` profile is used as fallback
- A spec-declared strategy always overrides a detected strategy
- A manifest-declared strategy overrides an auto-detected strategy (but not a spec-declared one)
- Detection heuristics must be deterministic — same file paths and project files always produce the same strategy
- `detectTaskStrategy` returns exactly one strategy per task, so every newly added strategy must declare its position in the detection cascade and must not claim path patterns already owned by a shipped strategy
- A `deferred` VerificationOutcome never satisfies a GREEN exit condition for any strategy, and never counts toward a passing gate

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Strategy Type Registry | Define the strategy types with summary traits (RED/GREEN semantics, domain, typical tools). Count is not stated here — it is a function of the registry, currently 9; the three revision-5 rows below carry the extension to 12 | must-have | | implemented |
| Manifest Schema Extension | `test_strategies` section in manifest.yaml for declaring available strategies, commands, tiers, and path globs | must-have | | review-passed |
| Strategy Detection Heuristics | Auto-detect available strategies from project files (dbt_project.yml -> fixture, Terraform -> policy, etc.) and task file paths (migrations/ -> schema) | must-have | | review-passed |
| Strategy Assignment Protocol | Rules for how plan assigns a strategy per task: spec-declared > manifest-declared > auto-detected > fallback to unit | must-have | | review-passed |
| Strategy Profile Contract | Define what each profile Live Spec must contain: RED exit condition, GREEN exit condition, gaming blockers, assertion rules, seed data rule, handoff format | must-have | | review-passed |
| Plan Integration | Extend plan output to include `strategy` field per task with assignment source and confidence | must-have | | review-passed |
| Plan Infrastructure Requirements | When plan includes non-unit strategies or the spec has `infra_requirements:`, emit a consolidated Test Infrastructure Requirements section listing accounts, credentials, pre-provisioned state, and CI invocation | should-have | | validated |
| Write-test Dispatch | Write-test loads the matching strategy profile and follows its rules instead of hardcoded unit-test rules | must-have | | review-passed |
| Fallback Behavior | When no profile exists for an assigned strategy, fall back to unit profile with an advisory message | should-have | | review-passed |
| Confidence Reporting | Strategy assignments include confidence level (high/medium/low) so humans can review low-confidence assignments before proceeding | nice-to-have | | review-passed |
| Cross-strategy Gaming Patterns | Shared gaming detection patterns that apply across all strategies (e.g., disabled tests, empty assertions) | nice-to-have | | review-passed |
| Integration Strategy Profile | Define the integration strategy profile — 9th strategy type for behavioral tests against real external infrastructure with no mocking at the infrastructure boundary | nice-to-have | | validated |
| Test Depth Policy | Risk-scaled control over how many case classes a suite must cover (depth), independent of which strategy applies | must-have | | validated |
| Gaming Detector Gate Enforcement | Wire the 8 gaming detectors in `lib/test-strategies/gaming.mjs` into a deterministic `PreToolUse` hook that blocks (before the write lands) newly introduced gaming violations in test files, replacing agent-prose-only enforcement | must-have | | validated |
| Snapshot Strategy Profile | Define the `snapshot` strategy profile — 10th strategy type, for work whose deliverable is emitted/derived state (config, generated files, migrated datasets) verified against a captured, checksummed baseline of the pre-change world | must-have | | review-pending |
| Reconciliation Strategy Profile | Define the `reconciliation` strategy profile — 11th strategy type, for migration and dual-write work verified by comparing two independently-produced populations (source vs. target) across row counts, schema, and column profiles, with a classified drift verdict | must-have | | review-pending |
| Tolerance Strategy Profile | Define the `tolerance` strategy profile — 12th strategy type, for data-quality assertions that pass within a declared, non-zero numeric tolerance band. Distinct from `threshold`, which is performance-only and remains so | must-have | | review-pending |
| Verification Ledger and Deferred State | Closed verification-outcome enum recorded on the existing lifecycle event log (no new store), with `deferred` as a loud non-passing state carrying a reason code and the unmet `infra_requirements` entry | must-have | | review-pending |
| Manifest Template Activation | Uncomment and activate the `test_strategies` block in `templates/manifest-template.yaml` so newly scaffolded projects declare strategies for real | should-have | | proposed |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Prompt / LLM-Output Strategy Profile | Premature as a 13th strategy. `/adev:eval` already ships an LLM-as-Judge scoring layer, so this is an overlap rather than a gap; a strategy profile would need to define a deterministic RED for a non-deterministic subject, which none of the audit evidence resolves. Revisit only if a project demonstrates a prompt-regression need that `/adev:eval` cannot express. | — | `/adev:eval` LLM-as-Judge layer |
| Snapshot Capture Tooling | Profiles define what a valid snapshot must satisfy (deterministic ordering, checksum, provenance). Shipping dump/checksum utilities would import domain-specific database knowledge into adev and violates "minimize external dependencies". | — | Snapshot Strategy Profile |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `resolveStrategy(task, manifest, spec)` | function | Returns a StrategyAssignment given a task's file paths, manifest declarations, and optional spec override. Implements the priority chain: spec > manifest > detected > fallback. |
| `getStrategyProfile(strategyId)` | function | Returns the strategy profile (rules, gaming patterns, RED/GREEN semantics) for a given strategy ID. Returns `unit` profile if the requested profile doesn't exist. |
| `detectStrategies(projectRoot)` | function | Scans project files and returns a list of auto-detected strategy IDs with confidence levels. |
| `detectTaskStrategy(filePaths)` | function | Resolves a single strategy ID from a task's file paths using path pattern matching. Used internally by `resolveStrategy`. |
| `getStrategy(id)` | function | Returns a strategy type definition from the registry (summary traits, not the full profile). Returns null if not found. |
| `listStrategies()` | function | Returns all 12 strategy types in stable alphabetical order. |
| `test_strategies` manifest schema | config | YAML schema for declaring strategies in manifest.yaml. Consumed by plan, write-test, implement. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `manifest.yaml` | setup | Reads `test_strategies` section and `gates` section |
| `platform-context.yaml` | setup | Reads `language`, `test_runner`, `framework` for detection heuristics |
| Task file paths | planning | Plan provides file paths per task for strategy detection |
| Spec `test_strategy` field | design | Optional override declared in Live Spec frontmatter |
| Spec test_depth field | design | Live Specs may declare optional test_depth override in frontmatter, alongside the existing test_strategy field |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Backward compatibility | Projects with no `test_strategies` in manifest must behave identically to today — all tasks get `unit` strategy, no new warnings or errors |
| Detection accuracy | Auto-detection heuristics must produce zero false positives on standard project layouts (dbt, Terraform, React, Node.js, Go, Rust, Python) |
| Extensibility | Adding a strategy requires only a new profile Live Spec, a registry entry, a profile markdown file, and a detection heuristic entry — no changes to the core abstraction. Registry entry, profile file, and the registry count assertions in `tests/lib/test-strategies/registry.test.mjs` and `tests/evals/test-strategies/test-strategies.test.mjs` must land in the same change or not at all. |
| Non-code applicability | A project with zero source files in the deliverable (config-only, data-migration-only) must be able to declare a strategy, receive an assignment, and record verification outcomes without any file the agent authors being the subject under test |
| No silent skips | A verification that cannot run for environmental reasons must be recorded as `deferred` with a reason code and surfaced in the rendered board — never as a pass, and never as an absent record |
| Performance | `detectStrategies()` must complete in under 2 seconds on repos up to 10k files (file globbing only, no content parsing) |
| Transparency | Every strategy assignment must log its source (spec-declared / manifest / detected / fallback) so humans can audit and override |
