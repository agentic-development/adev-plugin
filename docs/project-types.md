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
