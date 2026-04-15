---
status: approved
revision: 2
updated: 2026-04-15
---

# Feature Charter: Unified Gates

## Business Intent

Unify governance gates and manifest tiered gates into a single gate system in `governance/gates.yaml`. Today the plugin has two competing gate configuration systems that silently override each other, forcing users to choose between governance metadata (kind, triggers, scope, required) and tiered execution (fast/integration/e2e with progressive fail-fast). This charter eliminates the conflict by making `governance/gates.yaml` the sole source of truth for all gate definitions, with tiers as a first-class property of each gate.

## Scope and Boundaries

### In Scope

- Unified gate schema in `governance/gates.yaml` with tier placement as a gate property (`tier: fast | integration | e2e`)
- All governance metadata on every gate: `kind`, `triggers`, `scope`, `required`, `severity`
- Tier execution order and fail-fast semantics (fast -> integration -> e2e)
- `transitions` section for lifecycle stage requirements (e.g., `implement-to-validate: required_gates: [test, lint]`)
- E2E sub-keys (`smoke`/`full`) with independent severity
- Migration: remove `manifest.yaml gates:` section, update all consuming skills (validate, implement, build, hygiene)
- Update `gates-template.yaml` and `/adev:init` scaffolding
- Normalize skip behavior in validate: unconfigured checks report SKIP (not PASS), misconfigured checks report WARN
- Backward compatibility: projects without `governance/gates.yaml` get a "no gates configured" advisory with setup guidance

### Out of Scope

- `boundaries.yaml` and `risk-policies.yaml` — unchanged, separate governance concerns
- Test authoring or TDD enforcement — owned by `write-test` and `implementation` charters
- CI/CD pipeline changes — owned by `cicd` charter
- Probabilistic gate execution logic (LLM-as-Judge) — the schema declares `kind: probabilistic` but execution is handled by the eval skill, not this charter
- Flaky test quarantining — a project-level concern, not a framework feature

### Dependencies

| Dependency | Direction | Description |
|-----------|-----------|-------------|
| validation | modifies | Updates Check 1 gate source resolution and Checks 8-9 skip behavior in `/adev:validate` SKILL.md |
| implementation | modifies | Updates Step 2-post integration gate source in `/adev:implement` SKILL.md |
| strategic-planning | modifies | Updates `/adev:build` SKILL.md gate passthrough and dry-run display |
| maintenance | modifies | Updates `/adev:hygiene` Pass 8 governance health checks |
| setup | modifies | Updates `gates-template.yaml`, `/adev:init` scaffolding, removes manifest `gates:` |
| tiered-test-gates | supersedes | This charter replaces the gate schema and resolution portions of the tiered-test-gates charter |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Gate | A single quality check with execution metadata | `id`, `name`, `kind` (deterministic/probabilistic), `tier` (fast/integration/e2e), `command`, `scope` (project/charter), `required` (boolean), `severity` (error/warning), `triggers` (list) |
| Tier | An execution group that gates are assigned to | `name` (fast/integration/e2e), execution order, fail-fast semantics |
| Transition | A lifecycle stage boundary requiring specific gates to pass | `id` (e.g., implement-to-validate), `required_gates` (list of gate IDs), `approver_role` (optional) |
| GateResult | The outcome of executing a gate | `gate_id`, `tier`, `status` (pass/fail/warn/skip), `output`, `duration` |

### Relationships

- A Gate belongs to exactly one Tier (via `tier` field)
- A Transition references one or more Gates by ID
- A GateResult is produced per Gate per execution
- Gates within a Tier execute sequentially; Tiers execute in fixed order (fast -> integration -> e2e)

### Invariants

- Every gate with a non-empty `command` and `kind: deterministic` is executable by skills
- Gates with `kind: probabilistic` have no `command` — they are evaluated by the eval skill, not by shell execution
- A gate with `required: false` always maps to `severity: warning` regardless of any explicit severity
- Tiers execute in fixed order: fast -> integration -> e2e. A tier is skipped if no gates are assigned to it
- An error-severity gate failure within a tier stops remaining gates in that tier and all subsequent tiers
- Gate IDs referenced in `transitions.*.required_gates` must exist in the `gates` list

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Unified Gate Schema | Define the `governance/gates.yaml` schema with `tier` as a first-class gate property alongside `kind`, `scope`, `required`, `severity`, `triggers`, and `command` | must-have | | validated |
| Tiered Execution from Governance | Skills read `governance/gates.yaml`, group gates by tier, and execute in order (fast -> integration -> e2e) with fail-fast between error-severity tiers | must-have | | validated |
| Manifest Gates Removal | Remove `gates:` section from `manifest.yaml` schema, update manifest template, update `/adev:init` scaffolding to generate `governance/gates.yaml` instead | must-have | | validated |
| Skill Migration | Update consuming skills (validate Check 1, implement Step 2-post, build, hygiene Pass 8) to read from `governance/gates.yaml` only | must-have | | validated |
| Explicit Skip Reporting | Normalize skip behavior in validate: unconfigured checks report SKIP (not PASS), misconfigured checks report WARN. Checks 8 and 9 no longer silently pass when governance is absent. Report summary shows count of skipped checks with setup guidance. | must-have | | validated |
| Transition Gates | Preserve `transitions` section in `governance/gates.yaml` with `required_gates` referencing gate IDs — consumed by validate Check 9 and review-specs | should-have | | validated |
| Severity and Required Reconciliation | `required: false` forces `severity: warning`. Explicit `severity` on a gate overrides tier defaults. Default severity: `error` for fast/integration, `warning` for e2e | should-have | | validated |
| E2E Sub-keys | Support `smoke`/`full` groupings within e2e-tier gates, with independent severity defaults (`error` for smoke, `warning` for full) | should-have | | validated |
| Backward Compatibility Path | Projects with existing `manifest.yaml gates:` get a migration warning from `/adev:init` or `/adev:hygiene` suggesting they generate `governance/gates.yaml` | nice-to-have | | validated |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `governance/gates.yaml` | Config | Single source of truth for all gate definitions, tier assignments, and lifecycle transitions. Consumed by validate, implement, build, hygiene, and review-specs skills. |
| Gate resolution logic | Concept | Documented rules for reading `governance/gates.yaml`, grouping gates by tier, applying severity defaults, and executing in order. Described in skill markdown, referenced by all consuming skills. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `/adev:validate` Check 1 | validation | Modified to read gates exclusively from `governance/gates.yaml` |
| `/adev:validate` Check 9 | validation | Reads `transitions` from `governance/gates.yaml` (unchanged behavior, same file) |
| `/adev:implement` Step 2-post | implementation | Reads integration-tier gates from `governance/gates.yaml` |
| `/adev:build` dry-run | strategic-planning | Reads gate tier summary from `governance/gates.yaml` for display |
| `/adev:hygiene` Pass 8 | maintenance | Validates `governance/gates.yaml` structure, gate refs, transition refs |
| `/adev:review-specs` | assessment | Reads `transitions.spec-to-plan` for `approver_role` |
| `/adev:init` | setup | Scaffolds `governance/gates.yaml` from template |
| Shell commands | External | Gate commands executed via `child_process` — unchanged |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Backward Compatibility | Projects without `governance/gates.yaml` must not break — skills skip gate execution with an explicit advisory. Projects with existing `manifest.yaml gates:` get a migration warning, not a failure. |
| Single Source of Truth | No gate configuration outside `governance/gates.yaml` is honored at runtime. No fallback chains, no precedence rules, no silent overrides. |
| Transparency | Every validation report explicitly shows what ran, what was skipped, and why. No silent passes for unchecked items. |
| Performance | Gate resolution (reading and grouping the YAML) adds negligible overhead. Execution time is dominated by the gate commands themselves, not the framework. |
