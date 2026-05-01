---
status: draft
revision: 1
updated: 2026-05-01
---

# Feature Charter: Infrastructure Preflight

## Business Intent

Infrastructure Preflight provides runtime verification of external system availability before skills execute code or tests. It reads `infra_requirements` declarations from specs and plans, verifies environment variables, CLI tools, and connectivity probes, and blocks execution with actionable diagnostics when requirements are unmet — shifting infrastructure failures from cryptic mid-execution errors to clear, upfront blockers.

## Scope and Boundaries

### In Scope

- `infra_requirements` schema extension with `cli_tools[]`, `probe`, and `check_level` verification fields
- Generic verification runner (`lib/infra-preflight.mjs`): env var presence, CLI tool PATH check, probe command execution
- Structured pass/fail report per system
- Blocking semantics by default; `--no-infra` user-only override flag
- Per-system config override to downgrade check level (e.g., skip connectivity, presence-only)
- SKILL.md preflight step additions to: implement, validate, build, and write-test (mandatory); debug, eval, and recover (conditional — triggered by `infra_requirements` presence in referenced spec/plan)
- Timeout handling for probe commands

### Out of Scope

- System-specific verification logic (no hardcoded AWS/Postgres/Docker knowledge)
- Provisioning or fixing infrastructure (only detection, not remediation)
- Modifying the `infra_requirements` authoring flow (owned by plan-infra-requirements spec in test-strategies)
- Adding a new lifecycle skill (this is a phase within existing skills, not a standalone skill)
- CI/CD integration (CI handles its own infra availability)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| test-strategies (plan-infra-requirements) | internal spec | Consumes `infra_requirements` schema defined there; extends it with verification fields |
| implement, validate, build, write-test, debug, eval, recover | internal skills | Modified to include preflight step |
| `child_process` (Node.js built-in) | runtime | Used for probe execution and CLI tool detection (via `execFileSync` — no shell) |
| `@dotenvx/dotenvx` | dev dependency | Secure `.env` file loading. Requires ADR justification. |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| InfraRequirement | A single external system declared in a spec's `infra_requirements` block | `name`, `env_vars[]`, `cli_tools[]`, `probe` (command string), `check_level` (full/presence-only/skip) |
| PreflightReport | Structured result of running all checks for a spec/plan | `passed` (bool), `systems[]` (per-system results), `skipped` (bool, via `--no-infra`) |
| SystemCheckResult | Verification outcome for one declared system | `name`, `env_vars_ok` (bool), `missing_env_vars[]`, `cli_tools_ok` (bool), `missing_tools[]`, `probe_ok` (bool/null), `probe_error` (string/null) |

### Relationships

- A spec declares zero or more InfraRequirements in its frontmatter
- A PreflightReport contains one SystemCheckResult per declared InfraRequirement
- Skills consume one PreflightReport before proceeding to execution

### Invariants

- If any SystemCheckResult has a failure, the PreflightReport `passed` is `false`
- A failed PreflightReport blocks skill execution unless `--no-infra` is explicitly passed by the user
- The agent must never autonomously set `--no-infra` — only the user can bypass the preflight
- Probe commands execute with a configurable timeout (default: 10s) — timeout counts as failure
- No secret values appear in the PreflightReport (only env var names, not their values)

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Verification Runner | `lib/infra-preflight.mjs` — parse `infra_requirements`, run env var presence checks, CLI tool PATH checks, and probe commands; return structured PreflightReport | must-have | 1 | specified |
| Schema Extension | Extend `infra_requirements` with `cli_tools[]`, `probe`, and `check_level` fields | must-have | 1 | specified |
| Skill Integration (Mandatory) | Add preflight step to implement, validate, build, and write-test SKILL.md files with blocking semantics and `--no-infra` override | must-have | 1 | — |
| Skill Integration (Conditional) | Add preflight step to debug, eval, and recover SKILL.md files — triggered only when referenced spec/plan has `infra_requirements` | should-have | 1 | — |
| Per-System Check Level Override | Allow `check_level: presence-only` or `check_level: skip` per system in `infra_requirements` to downgrade verification | should-have | 1 | specified |
| Probe Timeout Configuration | Configurable timeout per probe (default 10s), declared in `infra_requirements` or manifest-level default | nice-to-have | 1 | specified |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `runPreflight(specPath, planPath, options)` | function | Reads `infra_requirements` from a spec and/or plan file, merges systems (plan wins on conflict), runs all verification checks, returns a PreflightReport. Either path may be `null`. Options: `{ timeout, noInfra }` |
| `parseInfraRequirements(filePath)` | function | Parses the `infra_requirements` YAML block from a spec/plan frontmatter. Returns structured array of InfraRequirement objects, or `null` if none declared |
| `formatPreflightReport(report)` | function | Renders a PreflightReport as human-readable markdown for skill output (pass/fail per system with actionable error messages) |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `infra_requirements` frontmatter | test-strategies (plan-infra-requirements spec) | Schema for declaring systems, env vars, and notes. Extended here with `cli_tools[]`, `probe`, `check_level` |
| `child_process.execFileSync` | Node.js built-in | Executes probe commands (no shell — manual `$VAR` substitution) and `which`/`--version` checks with timeout |
| `@dotenvx/dotenvx` | dev dependency | Secure `.env` file loading. Requires ADR justification (dev-only, no network calls, pinned version). |
| Spec/plan file paths | implement, validate, build, write-test, debug, eval, recover | Each skill passes the relevant spec or plan path to `runPreflight()` |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Full preflight (env vars + CLI tools + probes) must complete within 30s for up to 10 declared systems. Individual probe timeout defaults to 10s. |
| Security | PreflightReport must never contain secret values — only env var names and pass/fail status. Probe commands execute via `execFileSync` with no shell (manual `$VAR` substitution only). Probe output sanitized at capture time (200 char max, ANSI stripped). `env_file` paths validated to be within project root. |
| Backward compatibility | Skills with no `infra_requirements` in their spec/plan behave identically to today — no preflight step runs, no new output, no performance overhead beyond parsing frontmatter. |
| Transparency | Every check result is reported with system name, check type, and actionable error message (e.g., "Missing env var: DATABASE_URL — set it in .env.test or CI secrets"). |
| Resilience | If `lib/infra-preflight.mjs` fails to load, the skill emits a warning and asks the user to proceed with `--no-infra` or fix the lib. Skill remains functional. |
