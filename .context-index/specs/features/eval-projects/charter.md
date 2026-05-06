---
status: draft
revision: 1
updated: 2026-05-06
---

# Feature Charter: eval-projects

## Business Intent

Provide a suite of four realistic, self-contained project repositories spanning common software archetypes (data pipeline, web API, data migration, process automation). Each project serves dual purposes: (1) eval targets for benchmarking adev skill quality, cost, and protocol adherence across diverse tech stacks, and (2) onboarding demos where new users experience the full adev lifecycle from `init` to `validate` on a real codebase.

## Scope and Boundaries

### In Scope

- Four standalone repos: `adev-pipeline-eval`, `adev-api-eval`, `adev-migrations-eval`, `adev-automation-eval`
- Infrastructure via Docker Compose where the project needs external services (databases, queues). Simpler projects use file-based/embedded storage with no Docker.
- Each repo has a working codebase (5-15 source files)
- Each repo has a `main` branch (bare project, no `.context-index/`), a `with-context` branch (pre-populated `.context-index/` for eval runs), and a `plain-claude` branch (all TODO features implemented by plain Claude Code without adev, serving as baseline)
- Each repo includes a planted bug that produces wrong output (testable with `/adev:debug`)
- Each repo includes a README with TODO features (buildable with the adev lifecycle)
- Each repo includes onboarding instructions for running adev from scratch
- Submodule registration in adev-plugin under `tests/evals/`
- Eval harness directories (scenarios, rubrics) in adev-plugin under `tests/evals/<domain>/`

### Out of Scope

- Production-grade code — projects are intentionally small with intentional gaps
- Cross-project dependencies — each project is fully independent
- CI/CD for the eval projects themselves — they are static fixtures

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `tests/evals/` | internal directory | Existing eval directory structure in adev-plugin |
| `.gitmodules` | git config | Submodule registration in adev-plugin root |
| `tests/evals/data-engineering/` | internal module | Existing eval harness pattern (reference for new harnesses) |
| adev skills | internal module | Skills users invoke during onboarding (`skills/*/SKILL.md`) |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Eval Project | A standalone repo serving as eval target and onboarding demo | name, tech-stack, language, domain, infrastructure-type |
| Branch Variant | A branch within an eval project serving a specific purpose | name (`main`, `with-context`, or `plain-claude`), has-context-index (bool), has-todo-features (bool) |
| Planted Bug | An intentional defect producing wrong output | location (file path), symptom (user-visible), root-cause (hidden) |
| TODO Feature | A feature described in the README for users to build with adev | description, complexity (simple/medium/complex), lifecycle-coverage (which adev skills it exercises) |
| Intentional Gap | A deliberate omission for eval rubrics to detect | type (missing test, no docs, incomplete spec, etc.), location |

### Relationships

- Each Eval Project has exactly 3 Branch Variants (`main`, `with-context`, `plain-claude`)
- Each Eval Project has exactly 1 Planted Bug
- Each Eval Project has 4-6 TODO Features spanning different lifecycle phases
- Each Eval Project has 3+ Intentional Gaps for skill detection

### Invariants

- Every Eval Project's `main` branch must have zero `.context-index/` files
- Every Eval Project's `main` branch codebase must be functional (tests pass, scripts run)
- Every Eval Project's `plain-claude` branch must have zero `.context-index/` files and all TODO features implemented
- The Planted Bug must produce incorrect output (not crash or fail to start). The bug must be at the integration/output layer — not caught by existing unit tests, so the project's own test suite still passes
- TODO Features collectively must exercise brainstorm, specify, plan, implement, validate, and debug across the suite

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Pipeline Eval Project | Python weather/IoT sensor data pipeline with DuckDB — ingests CSV/JSON, cleans, aggregates, loads | must-have | v1 | implemented |
| API Eval Project | TypeScript/Node.js bookstore REST API with Docker+Postgres — CRUD for books, authors, reviews | must-have | v1 | implemented |
| Migration Eval Project | Python+YAML legacy ETL migrating to dbt+DuckDB — both pipelines functional, same source data, comparable output | must-have | v1 | implemented |
| Automation Eval Project | Python file-processing pipeline — watches inbox, validates CSV, transforms, generates reports, archives | must-have | v1 | implemented |
| Plain-Claude Baseline Branches | All TODO features implemented by plain Claude Code (no adev skills) on `plain-claude` branch for each project, tagged with model version | must-have | v1 | specified |
| Version Tagging | Adev eval runs tagged `adev-v<version>`, baseline builds tagged `plain-claude-<model>` for traceability | must-have | v1 | specified |
| With-Context Branches | Pre-populated `.context-index/` on `with-context` branch for each project (constitution, manifest, platform-context, one extracted spec) | must-have | v1 | specified |
| Onboarding Guides | README instructions in each project covering: quick start, how to init adev, suggested lifecycle walkthrough for TODO features | must-have | v1 | specified |
| Planted Bugs | One subtle bug per project producing wrong output (not crashes), discoverable via `/adev:debug` | must-have | v1 | specified |
| TODO Feature Lists | 4-6 features per project spanning brainstorm→validate, documented in README | must-have | v1 | specified |
| Submodule Registration | All four repos registered as submodules in adev-plugin under `tests/evals/` | must-have | v1 | specified |
| Eval Harness Scaffolds | Scenario and rubric directories per project domain under `tests/evals/<domain>/` | should-have | v2 | specified |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Eval Harness Implementation | Scenarios and rubrics require projects to exist first | v2 | All v1 project capabilities |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| Eval target repos | Git submodule | Four repos under `tests/evals/<name>/` consumable by the eval harness (`run-benchmark.sh`, `run-eval.mjs`) |
| Onboarding entry point | README.md | Each repo's README provides a self-guided walkthrough for new adev users |
| `with-context` branch | Git branch | Pre-populated `.context-index/` for direct skill execution without running `/adev:init` first |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Eval harness runner | `tests/evals/data-engineering/run-benchmark.sh` | Existing benchmark runner that executes skills against target project dirs |
| Eval scorer | `tests/evals/data-engineering/run-eval.mjs` | Existing deterministic scorer that evaluates outputs against rubrics |
| adev skills | `skills/*/SKILL.md` | Skills users invoke during onboarding and that the eval harness benchmarks |
| `.gitmodules` | adev-plugin root | Submodule registration pointing to each eval repo |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Portability | Each project runs on macOS and Linux. Only prerequisites: language runtime (Python 3.11+ or Node.js 20+) and Docker (when `docker-compose.yml` is present) |
| Reproducibility | Running the quick-start commands in the README produces deterministic output. Seed data is static (no random generation, no API calls) |
| Isolation | Each project is fully self-contained — no shared state, no cross-project imports, no assumptions about adev-plugin being installed |
| Realism | Codebases follow real-world conventions for their stack (PEP 8, ESLint defaults, standard project layouts). Not toy code — actual patterns a developer would recognize |
| Debuggability | Planted bugs produce subtle wrong output, not crashes. The symptom is observable by running the project and inspecting results. Root cause requires reading 2+ files to trace |
