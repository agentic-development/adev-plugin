[adev docs](README.md) > Advanced

# Project Types Guide

adev is project-type agnostic. The framework adapts to whatever tech stack, language, and conventions your project uses. When you run `/adev:init`, it detects your project's language, package manager, and build tools, then generates a constitution and manifest tailored to that environment.

This guide shows worked examples using real projects from the adev eval fixture suite. Each example walks through what adev artifacts look like for that project type — from the constitution and manifest through charters, specs, and implementation.

## Worked Examples

| Project Type | Tech Stack | Repository |
|-------------|-----------|------------|
| [Data Pipeline](project-types/data-pipeline.md) | dbt + DuckDB | [adev-data-eval](https://github.com/agentic-development/adev-data-eval) |
| [API Service](project-types/api-service.md) | Node.js + Express | [adev-api-eval](https://github.com/agentic-development/adev-api-eval) |
| [CI/CD Pipeline](project-types/ci-cd-pipeline.md) | GitHub Actions + Docker | [adev-pipeline-eval](https://github.com/agentic-development/adev-pipeline-eval) |
| [Database Migrations](project-types/database-migrations.md) | Node.js CLI + PostgreSQL | [adev-migrations-eval](https://github.com/agentic-development/adev-migrations-eval) |

Each page includes the full constitution, manifest, charter, and spec examples for that project type.

## Applying adev to Your Own Project Type

The examples above cover data pipelines, API services, CI/CD pipelines, and database migration tools. But adev works with any project type. Here is how to apply the patterns you have seen to your own project.

### Common Patterns Across All Project Types

Regardless of tech stack, every adev project follows the same structural pattern:

1. **Constitution captures project identity.** The constitution describes what the project is, what principles it follows, and what coding standards apply. For a React app, principles might focus on component isolation and accessibility. For a machine learning project, they might focus on reproducibility and evaluation metrics. The content changes; the structure stays the same.

2. **Manifest declares platform and quality gates.** The `gates.test` field always points to whatever runs your tests — `npm test`, `pytest`, `dbt test`, `go test`, `make test`. The `modules` list always maps your project's directory structure to logical units adev can reason about.

3. **Specs use behavioral contracts.** The When/Then format works for any domain. For a frontend component: "When the user clicks Submit, then the form validates and shows a success message." For a data model: "When the pipeline runs, then the mart table has one row per customer." The pattern transfers.

4. **Plans decompose into TDD tasks.** Every plan task follows RED-GREEN-REFACTOR regardless of project type. Write a failing test, make it pass, clean up. The test runner and assertion style change; the discipline does not.

### Adapting for Unlisted Project Types

Here are quick notes on how adev adapts for project types not shown above:

- **Frontend / SPA:** Quality gates include browser tests (Playwright, Cypress). Specs focus on user interactions and visual behavior. The visual verification step in `/adev:implement` activates automatically for `.tsx`, `.vue`, and `.svelte` files.

- **Mobile apps (React Native, Flutter):** Platform context includes target OS and device profiles. Specs cover device-specific behavior (permissions, offline mode). Quality gates include simulator/emulator tests.

- **Libraries / SDKs:** Specs focus on the public API surface. Quality gates include backward compatibility checks and API diff tests. Charters track the API contract as the primary deliverable.

- **Monorepos:** Workspace configuration coordinates multiple modules. Cross-module specs define integration contracts. `/adev:init` detects workspace tools (Nx, Turborepo, npm workspaces) and generates per-package manifests.

- **ML / AI projects:** Specs cover model behavior with evaluation metrics as acceptance criteria. Quality gates include benchmark runs and regression checks. Constitutions emphasize reproducibility and data versioning.

### The Key Principle

adev does not prescribe how your project should be built. It provides a consistent process — brainstorm, charter, specify, plan, implement, validate — that adapts to whatever quality gates and conventions your project needs. The constitution and manifest are where that adaptation happens. Everything else follows from them.

## Bundled Domain Profiles

Domain profiles provide domain-specific lifecycle configuration. Each profile ships as a set of 7 overlay files that customize charters, specs, reviewers, gates, verification, and test tooling for a particular domain. Set `domain: <name>` in your manifest or charter frontmatter to activate a profile.

### software (default)

The `software` profile is the default. Projects with no `domain:` declaration use this profile automatically. It contains the framework's standard configuration extracted into overlay files:

- **Charter overlay** — Standard sections: Business Intent, Scope and Boundaries, Domain Model (Entities, Relationships, Invariants), Capability Map, Interface Contracts, Quality Attributes (latency p50/p95/p99, throughput, availability, error rate, test coverage).
- **Spec overlay** — Standard sections: Behavioral Contract, Preconditions, Behaviors, Postconditions, Error Cases (Condition / Expected Behavior / Error Code), Visual Expectations, Acceptance Criteria.
- **Reviewers** — Three reviewers: structural-architect, security-reviewer, consistency-analyzer. `merge_strategy: append`, `blocker_threshold: 1`.
- **Gates** — Standard quality gate running `npm test`.
- **Verification** — Visual verification with Playwright at breakpoints 375, 768, 1280. Triggers on `*.html`, `*.jsx`, `*.tsx`, `*.vue`, `*.svelte`.
- **Gate config** — 27 file exclusion patterns and 31 bash passthrough commands covering standard development tooling.
- **Test config** — Permitted tools: node:test, jest, vitest, mocha, pytest, go test, cargo test. Max test file size: 512 KB. 7 skip patterns for gaming detection.

### data-engineering

The `data-engineering` profile is designed for data pipeline projects using tools like dbt, DuckDB, and Python data tooling:

- **Charter overlay** — Uses data domain vocabulary: Data Contract (instead of Interface Contracts), Data Model (Sources, Transformations, Outputs instead of Entities/Relationships), Data Lineage, Pipeline Stages. Quality attributes: freshness SLA, completeness (null rate), accuracy, row count stability, schema drift detection.
- **Spec overlay** — Error cases use Failure Mode / Recovery Action columns. Replaces Visual Expectations with Data Quality Expectations. Adds Output Schema section.
- **Reviewers** — Data Contract Reviewer focused on schema completeness, SLA definitions, and data quality thresholds. `merge_strategy: append`.
- **Gates** — Data quality gate checking schema validation and data fixture definitions.
- **Verification** — Output-based verification (assertion-based output comparison). Triggers on `*.parquet`, `*.csv`, `*.json`, `*.yaml`. No browser tool required.
- **Gate config** — Includes data-specific file exclusions (`*.parquet`, `*.duckdb`, `seeds/**`, `target/**`) and passthrough commands (`dbt run`, `dbt test`, `dbt build`, `python -m pytest`).
- **Test config** — Permitted tools: pytest, dbt test, node:test. Max test file size: 1 MB (data test files can be larger). Python/dbt-specific skip patterns.

### process-automation

The `process-automation` profile is designed for workflow and process automation projects:

- **Charter overlay** — Uses workflow domain vocabulary: Integration Points (instead of Interface Contracts), Workflow Steps (instead of generic capabilities), Recovery & Compensation. Quality attributes: end-to-end latency, retry success rate, dead-letter rate, recovery time objective (RTO).
- **Spec overlay** — Error cases use Trigger / Outcome columns. Adds Integration Points section for external system touchpoints. Adds Recovery Actions section for compensation logic.
- **Reviewers** — Integration Reviewer focused on integration point completeness and recovery action coverage. `merge_strategy: append`.
- **Gates** — Flow coverage gate checking integration point tests and recovery action tests.
- **Verification** — Flow-based verification. Triggers on `*.workflow.yaml`, `*.flow.json`, `*.bpmn`. No browser tool required.
- **Gate config** — Includes automation-specific file exclusions (`*.workflow.yaml`, `*.bpmn`, `flows/**`) and passthrough commands (`python -m pytest`, `npm test`, `npx jest`).
- **Test config** — Permitted tools: pytest, node:test, jest. Max test file size: 512 KB. Python/JS skip patterns.

### Customizing a Bundled Profile

To customize a bundled profile without modifying it directly, create a custom domain that extends the bundled one:

1. Create `.context-index/domains/<custom-name>/domain.yaml` with `extends: <bundled-name>`.
2. Place only the overlay files you want to override in your custom domain directory. Missing files are inherited from the parent profile.
3. Set `domain: <custom-name>` in your manifest or charter frontmatter.

Example:

```yaml
# .context-index/domains/my-api/domain.yaml
extends: software
```

```yaml
# .context-index/domains/my-api/reviewers.yaml
merge_strategy: append
reviewers:
  - id: api-reviewer
    name: "API Reviewer"
    dispatch: always
    prompt: "Review API design for RESTful conventions and backward compatibility."
    profile: reviewer-capable
```

To reset all customizations, change `domain: <custom-name>` back to `domain: <bundled-name>` in your manifest. The bundled profile is always pristine and unmodified.
