---
status: approved
revision: 4
updated: 2026-08-13
---

# Feature Charter: Test Strategies

## Business Intent

Test Strategies provides a strategy abstraction layer that decouples the TDD lifecycle from unit-test assumptions. It defines 9 test strategies (unit, schema, contract, fixture, integration, policy, threshold, visual, smoke) that the plan, write-test, implement, and validate skills consume to adapt RED-GREEN-REFACTOR semantics to the actual domain of work — whether that's business logic, database migrations, data pipelines, infrastructure-as-code, service integrations, performance requirements, or UI components.

## Scope and Boundaries

### In Scope

- Strategy type definitions (9 strategies: unit, schema, contract, fixture, integration, policy, threshold, visual, smoke)
- Strategy detection heuristics (auto-detect from project files and task file paths)
- Manifest schema extension (`test_strategies` section for project-level declaration and overrides)
- Strategy assignment protocol (how plan assigns, how spec can override)
- Strategy profile contract (what each profile must define: RED/GREEN semantics, gaming patterns, assertion rules, handoff format)
- Fallback behavior (default to `unit` when no strategy matches or profile is unimplemented)

### Out of Scope

- Individual strategy profile implementations (each is a separate Live Spec)
- Test framework detection (already owned by write-test's `detect-framework.sh`)
- Gate tier assignment (owned by tiered-test-gates / unified-gates)
- Test execution and runner orchestration (owned by implement and validate)
- Spec authoring format changes (owned by specify)
- End-to-end verification that an authored suite matches its assigned depth (advisory floor only, no automated enforcement — issue-559)

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

### Relationships

- A project declares zero or more StrategyDeclarations in manifest.yaml
- Plan produces one StrategyAssignment per task
- Write-test loads the StrategyProfile matching the assignment
- Each StrategyDeclaration maps to exactly one tier in the gate system

### Invariants

- Every StrategyAssignment must resolve to a known strategy ID (one of the 9 defined types)
- If no StrategyProfile exists for an assigned strategy, the `unit` profile is used as fallback
- A spec-declared strategy always overrides a detected strategy
- A manifest-declared strategy overrides an auto-detected strategy (but not a spec-declared one)
- Detection heuristics must be deterministic — same file paths and project files always produce the same strategy

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Strategy Type Registry | Define the 9 strategy types with summary traits (RED/GREEN semantics, domain, typical tools) | must-have | | implemented |
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
| Gaming Detector Gate Enforcement | Wire the 8 gaming detectors in `lib/test-strategies/gaming.mjs` into a deterministic `PreToolUse` hook that blocks (before the write lands) newly introduced gaming violations in test files, replacing agent-prose-only enforcement | must-have | | planned |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `resolveStrategy(task, manifest, spec)` | function | Returns a StrategyAssignment given a task's file paths, manifest declarations, and optional spec override. Implements the priority chain: spec > manifest > detected > fallback. |
| `getStrategyProfile(strategyId)` | function | Returns the strategy profile (rules, gaming patterns, RED/GREEN semantics) for a given strategy ID. Returns `unit` profile if the requested profile doesn't exist. |
| `detectStrategies(projectRoot)` | function | Scans project files and returns a list of auto-detected strategy IDs with confidence levels. |
| `detectTaskStrategy(filePaths)` | function | Resolves a single strategy ID from a task's file paths using path pattern matching. Used internally by `resolveStrategy`. |
| `getStrategy(id)` | function | Returns a strategy type definition from the registry (summary traits, not the full profile). Returns null if not found. |
| `listStrategies()` | function | Returns all 9 strategy types in stable alphabetical order. |
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
| Extensibility | Adding a 9th strategy requires only a new profile Live Spec and a detection heuristic entry — no changes to the core abstraction |
| Performance | `detectStrategies()` must complete in under 2 seconds on repos up to 10k files (file globbing only, no content parsing) |
| Transparency | Every strategy assignment must log its source (spec-declared / manifest / detected / fallback) so humans can audit and override |
