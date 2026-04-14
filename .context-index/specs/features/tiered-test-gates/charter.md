---
status: approved
revision: 2
updated: 2026-04-14
---

# Feature Charter: Tiered Test Gates

## Business Intent

Enable the adev lifecycle to run tests at the right stage by categorizing quality gates into tiers (fast, integration, E2E). Currently all tests run as a single `npm test` gate, which means integration and E2E tests either run too early (slowing the TDD loop) or not at all (missing regressions). Tiered gates apply the Deployment Pipeline model — progressive confidence with fail-fast between tiers — so agents get fast feedback during implementation and broader coverage during validation.

## Scope and Boundaries

### In Scope

- Tiered gate schema in `manifest.yaml` (`gates.fast`, `gates.integration`, `gates.e2e`)
- Backward-compatible fallback: flat `gates.test` treated as `gates.fast.test`
- Configurable severity per tier (`error` = blocks, `warning` = reported only)
- Tiered fail-fast execution in `/adev:validate` Check 1
- Integration gate step in `/adev:implement` after all tasks complete
- Tier-aware gate passthrough in `/adev:build`
- E2E tier supports automated Playwright test scripts alongside the existing agent-driven visual verification (Check 11)

### Out of Scope

- CI/CD pipeline changes (GitHub Actions) — owned by the `cicd` charter
- Test authoring or TDD enforcement — owned by `write-test` and `implementation` charters
- Replacing visual verification (Check 11) — the E2E tier complements it, doesn't replace it
- Test discovery or convention-based probing — tiers are explicitly declared, not auto-detected
- Flaky test quarantining — a project-level concern, not a framework feature

### Dependencies

| Dependency | Direction | Description |
|-----------|-----------|-------------|
| validation | modifies | Changes Check 1 in `/adev:validate` SKILL.md |
| implementation | modifies | Adds integration gate step to `/adev:implement` SKILL.md |
| strategic-planning | modifies | Updates `/adev:build` SKILL.md to pass tier config |
| manifest.yaml | extends | Adds tiered structure to existing `gates:` section |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| GateTier | A named category of quality gates that run at a specific lifecycle stage | name (fast/integration/e2e), commands, severity, lifecycle stage |
| GateCommand | A single executable test/lint/typecheck command within a tier | key (test/lint/typecheck/smoke/full), command string |
| GateResult | The outcome of running a tier's commands | tier, command, status (pass/fail/warn/skip), output, duration |
| TierConfig | The full gates configuration resolved from manifest.yaml | tiers[], fallback mode (flat/tiered) |

### Relationships

- TierConfig contains one or more GateTiers, ordered: fast → integration → e2e
- GateTier contains one or more GateCommands
- Each GateCommand produces one GateResult when executed
- TierConfig detects fallback mode: if `gates.test` exists without tier keys, it wraps into a single fast tier

### Invariants

- Tiers always execute in order: fast → integration → e2e. A tier cannot run before the previous tier passes (unless the previous tier is not defined).
- A tier with `severity: error` that fails stops all subsequent tiers.
- A tier with `severity: warning` that fails records a WARN but does not block subsequent tiers.
- Default severity is `error` for fast and integration, `warning` for `e2e.full`, `error` for `e2e.smoke`.
- Backward compatibility: if `gates.test` exists as a flat string (no tier keys), it is treated as `gates.fast.test`. No migration required.

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Tiered Gate Schema | Extend `manifest.yaml` gates section to support `fast`, `integration`, and `e2e` tier keys with commands and severity | must-have | | review-passed |
| Backward-Compatible Fallback | Detect flat `gates.test` and auto-wrap into `gates.fast.test` so existing projects work without changes | must-have | | review-passed |
| Validate Tiered Execution | Split `/adev:validate` Check 1 into sub-checks (1a/1b/1c) with fail-fast between tiers | must-have | | review-passed |
| Implement Integration Gate | Add integration tier execution to `/adev:implement` after all tasks complete, before final cross-task review | must-have | | review-passed |
| Build Tier Passthrough | Update `/adev:build` to propagate tier configuration when invoking implement and validate | should-have | | review-passed |
| Severity Configuration | Allow per-tier `severity: error\|warning` with sensible defaults (error for fast/integration, warning for e2e.full) | should-have | | review-passed |
| E2E Playwright Scripts | Support automated Playwright test commands in the `e2e` tier, running alongside but separate from Check 11 visual verification | should-have | | review-passed |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Selective tier execution by changed files | Complexity; projects can scope commands themselves | v2 | Tiered Gate Schema |
| Flaky test quarantine tracking | Project-level concern, not framework feature | v2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `manifest.yaml gates:` schema | Config | Tiered gate declaration consumed by validate, implement, and build skills |
| Gate resolution logic | Concept | Logic to read manifest gates and resolve into ordered TierConfig (flat fallback or tiered) — described in skill markdown, not executable code |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `/adev:validate` Check 1 | validation | Modified to run tiers in order with fail-fast |
| `/adev:implement` Step 3 | implementation | Modified to run integration tier after all tasks |
| `/adev:build` Step 4-5 | strategic-planning | Modified to pass tier config to implement and validate |
| `manifest.yaml` | setup | Read by skills to resolve gate tiers |
| Shell commands | External | The actual test/lint/typecheck commands declared in each tier |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Fast tier must not add latency to the TDD inner loop — same behavior as current `gates.test`. Integration and E2E tiers add time only when defined. |
| Backward Compatibility | Projects with flat `gates.test` must work identically without any config changes. Zero migration burden. |
| Transparency | Gate results report tier name, command, status, and output so users understand exactly what ran and why it failed or warned. |
| Configurability | Severity defaults are sensible (error for fast/integration, warning for e2e.full) but overridable per project. |
