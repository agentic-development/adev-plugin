[adev docs](README.md) > Advanced

# Project Types Guide

adev is project-type agnostic. The framework adapts to whatever tech stack, language, and conventions your project uses. When you run `/adev:init`, it detects your project's language, package manager, and build tools, then generates a constitution and manifest tailored to that environment.

This guide shows worked examples using real projects from the adev eval fixture suite. Each example walks through what adev artifacts look like for that project type — from the constitution and manifest through charters, specs, and implementation.

> **Explore the fixtures yourself.** Each example references a fixture project under `tests/evals/`. To explore them locally, initialize the submodules:
>
> ```bash
> git submodule update --init tests/evals/
> ```

---

## Data Pipeline (dbt + DuckDB)

**Fixture:** `tests/evals/adev-data-eval/`

This is an e-commerce data engineering project built with dbt-core and DuckDB. It demonstrates how adev handles data transformation projects where the primary artifacts are SQL models, data tests, and pipeline orchestration.

### Tech Stack

- **Database:** DuckDB (zero-dependency, local)
- **Transformation:** dbt-core + dbt-duckdb
- **Orchestration:** Apache Airflow (DAG definitions)
- **Data Quality:** Great Expectations + dbt tests
- **Domain:** E-commerce (customers, orders, products, payments)

### How `/adev:init` Detects This Project Type

When `/adev:init` scans this project, it finds:

- `dbt_project.yml` — identifies it as a dbt project
- `requirements.txt` — Python dependencies
- `.python-version` — Python runtime
- `profiles.yml` — database connection configuration
- SQL files under `models/` — transformation layer

This detection drives the constitution and manifest generation.

### Constitution

For a data pipeline project, the constitution captures data-specific principles. A typical data engineering constitution includes:

```markdown
## Identity

E-commerce analytics data pipeline built with dbt and DuckDB, transforming raw
transactional data into business-ready dimensional models.

## Non-Negotiable Principles

1. **Data integrity first** — every model has schema tests; every transformation
   preserves referential integrity.
2. **Three-layer architecture** — staging (1:1 with sources), intermediate
   (business logic), marts (consumption-ready). No skipping layers.
3. **Idempotent transformations** — every model produces the same output given
   the same input, regardless of run order or frequency.
4. **Zero-dependency local development** — DuckDB means no external database
   server required for development or testing.
```

Compare this with the adev-plugin constitution (a JavaScript CLI project) where principles focus on ESM purity and minimal dependencies. The framework adapts to what matters for the domain.

### Manifest

The manifest declares the platform, quality gates, and module structure:

```yaml
project:
  name: "adev-data-eval"
  type: data-pipeline

gates:
  test: "dbt test"
  build: "dbt run"

modules:
  - slug: staging
    name: Staging Models
    paths:
      - models/staging/
  - slug: intermediate
    name: Intermediate Models
    paths:
      - models/intermediate/
  - slug: marts
    name: Mart Models
    paths:
      - models/marts/
  - slug: orchestration
    name: Orchestration
    paths:
      - dags/
```

Notice how quality gates use `dbt test` instead of `npm test`. The manifest adapts to whatever test runner the project uses.

### Charter Example

A charter for a data pipeline feature focuses on data transformations and quality:

```markdown
# Feature Charter: Customer Lifetime Value

## Business Intent
Add a customer lifetime value (CLV) calculation to the marts layer,
aggregating order history and payment data per customer.

## Capability Map
| Capability           | Priority  | Status  |
|---------------------|-----------|---------|
| CLV mart model       | must-have | pending |
| CLV schema tests     | must-have | pending |
| CLV snapshot (SCD2)  | should-have | pending |
```

### Spec Example

Specs for data models use behavioral contracts adapted to SQL transformations:

```markdown
## Behavioral Contract

### Preconditions
- `stg_customers`, `stg_orders`, and `stg_payments` models exist and pass tests

### Behaviors
1. **When** the CLV model runs **then** it produces one row per customer with
   `total_orders`, `total_spent`, and `clv_segment` columns.
2. **When** a customer has no orders **then** their `total_spent` is 0 and
   `clv_segment` is 'inactive'.

### Postconditions
- The model passes all schema tests (not_null, unique on customer_id)
- Row count matches the distinct customer count in staging
```

### Project Structure

The fixture demonstrates a three-layer dbt architecture:

```
models/
  staging/       — 1:1 with sources, light renaming and type casting
  intermediate/  — business logic joins and aggregations
  marts/         — business-facing fact and dimension tables
seeds/           — CSV seed data (raw layer)
tests/           — custom dbt data tests
macros/          — reusable SQL macros
snapshots/       — SCD Type 2 snapshots
dags/            — Airflow DAG definitions
```

---

## API Service

**Fixture:** `tests/evals/adev-api-eval/`

This fixture represents a REST API service project. API projects demonstrate how adev handles endpoint-driven development where specs map to routes, request/response contracts, and integration tests.

> **Note:** This fixture requires submodule initialization. Run `git submodule update --init tests/evals/adev-api-eval/` to explore it locally.

### How `/adev:init` Detects This Project Type

For an API service, `/adev:init` typically finds:

- `package.json` with server framework dependencies (Express, Fastify, Hono)
- Route handler files under `src/routes/` or `src/api/`
- Middleware files for authentication, validation, error handling
- OpenAPI or schema definition files

### Constitution

An API service constitution focuses on HTTP contract discipline and security:

```markdown
## Identity

RESTful API service providing e-commerce backend functionality
with authentication, order management, and payment processing.

## Non-Negotiable Principles

1. **Contract-first development** — API endpoints match OpenAPI schemas.
   Schema changes require spec updates before implementation.
2. **Authentication on every route** — no public endpoints except health
   checks and documentation. Middleware enforces auth by default.
3. **Consistent error responses** — all errors return structured JSON with
   `code`, `message`, and `details`. No raw stack traces in production.
4. **Idempotent mutations** — PUT and DELETE operations produce the same
   result regardless of how many times they are called.
```

### Manifest

```yaml
project:
  name: "ecommerce-api"
  type: api-service

gates:
  test: "npm test"
  lint: "npm run lint"

modules:
  - slug: auth
    name: Authentication
    paths:
      - src/routes/auth/
      - src/middleware/auth/
  - slug: orders
    name: Order Management
    paths:
      - src/routes/orders/
  - slug: payments
    name: Payments
    paths:
      - src/routes/payments/
```

### Charter Example

```markdown
# Feature Charter: Order Search API

## Business Intent
Add search and filtering to the orders endpoint, supporting
date ranges, status filters, and customer lookups.

## Capability Map
| Capability              | Priority  | Status  |
|------------------------|-----------|---------|
| GET /orders with filters| must-have | pending |
| Pagination support      | must-have | pending |
| Full-text search        | should-have | pending |
```

### Spec Example

API specs focus on HTTP contracts — methods, status codes, and response shapes:

```markdown
## Behavioral Contract

### Behaviors
1. **When** GET /orders?status=pending is called with valid auth
   **then** it returns 200 with an array of orders filtered to
   pending status.
2. **When** GET /orders is called without auth **then** it returns
   401 with error code `UNAUTHORIZED`.
3. **When** GET /orders?page=2&limit=10 is called **then** it
   returns the second page of 10 results with pagination metadata.

### Postconditions
- Response Content-Type is application/json
- Pagination metadata includes `total`, `page`, `limit`, `pages`
```

### How Skills Adapt

For API projects, adev skills adjust their behavior:

- **Test strategies** use HTTP request testing (supertest, fetch) instead of unit tests
- **Specs** focus on request/response contracts and status codes
- **Validation** checks endpoint accessibility and response schemas
- **Debug** examines middleware chains and request lifecycles

---

## CI/CD Pipeline

**Fixture:** `tests/evals/adev-pipeline-eval/`

This fixture represents a CI/CD pipeline project — infrastructure-as-code for build, test, and deployment automation. Pipeline projects show how adev handles projects where the "product" is the development workflow itself.

> **Note:** This fixture requires submodule initialization. Run `git submodule update --init tests/evals/adev-pipeline-eval/` to explore it locally.

### How `/adev:init` Detects This Project Type

For a CI/CD pipeline project, `/adev:init` looks for:

- `.github/workflows/` — GitHub Actions workflow files
- `Dockerfile` or `docker-compose.yml` — container definitions
- `Makefile` or `Taskfile` — build orchestration
- Infrastructure-as-code files (Terraform, Pulumi, CloudFormation)
- Deployment configuration (Kubernetes manifests, Helm charts)

### Constitution

A pipeline project constitution focuses on reliability and reproducibility:

```markdown
## Identity

CI/CD pipeline automating build, test, and deployment for a
microservices architecture using GitHub Actions and Docker.

## Non-Negotiable Principles

1. **Reproducible builds** — every build produces identical output given
   the same input. Pin all dependency versions. No floating tags.
2. **Fail fast, fail loud** — pipeline stages exit non-zero on any error.
   No silent failures, no swallowed exit codes.
3. **Secrets never in code** — all credentials come from secret managers
   or environment variables. No hardcoded tokens, keys, or passwords.
4. **Rollback-ready** — every deployment can be rolled back to the
   previous version with a single command or pipeline trigger.
```

### Manifest

```yaml
project:
  name: "deploy-pipeline"
  type: ci-cd

gates:
  lint: "actionlint"
  test: "make test-pipeline"

modules:
  - slug: build
    name: Build Stage
    paths:
      - .github/workflows/build.yml
      - Dockerfile
  - slug: deploy
    name: Deploy Stage
    paths:
      - .github/workflows/deploy.yml
      - k8s/
  - slug: monitoring
    name: Monitoring
    paths:
      - .github/workflows/monitor.yml
```

### Charter Example

```markdown
# Feature Charter: Canary Deployments

## Business Intent
Add canary deployment support that routes a percentage of traffic
to the new version before full rollout.

## Capability Map
| Capability                 | Priority  | Status  |
|---------------------------|-----------|---------|
| Canary workflow definition | must-have | pending |
| Traffic splitting config   | must-have | pending |
| Automated rollback trigger | must-have | pending |
| Metrics-based promotion    | should-have | pending |
```

### Spec Example

Pipeline specs focus on workflow behavior and failure modes:

```markdown
## Behavioral Contract

### Behaviors
1. **When** a push to main triggers the canary workflow **then** it
   deploys to the canary target with 10% traffic weight.
2. **When** canary error rate exceeds 5% for 5 minutes **then** the
   pipeline automatically rolls back and notifies the team.
3. **When** canary runs for 30 minutes with error rate below 1%
   **then** it promotes to full deployment.

### Error Cases
| Condition          | Expected Behavior         |
|-------------------|--------------------------|
| Canary pod crashes | Immediate rollback        |
| Metrics unavailable| Block promotion, alert    |
```

### How Skills Adapt

For pipeline projects, adev skills adjust:

- **Specs** focus on workflow triggers, stages, and failure recovery
- **Test strategies** use pipeline linting and dry-run execution
- **Validation** checks workflow syntax and secret references
- **Debug** traces pipeline execution logs and stage dependencies

---

## Database Migrations Tool

**Fixture:** `tests/evals/adev-migrations-eval/`

This fixture represents a database migrations tool — a utility that manages schema versioning and data migrations across environments.

> **Note:** This fixture requires submodule initialization. Run `git submodule update --init tests/evals/adev-migrations-eval/` to explore it locally.

### How `/adev:init` Detects This Project Type

For a migrations tool, `/adev:init` looks for:

- Migration files with sequential numbering or timestamps
- Database connection configuration
- CLI entry point for running migrations (up/down/status commands)
- Schema definition files or ORM configuration

### Constitution

```markdown
## Identity

Database migration tool for managing PostgreSQL schema changes
with versioned migrations, rollback support, and dry-run previews.

## Non-Negotiable Principles

1. **Ordered execution** — migrations run in strict sequential order.
   No gaps, no reordering, no parallel execution.
2. **Reversible by default** — every migration has a down() function.
   Irreversible migrations must be explicitly marked and approved.
3. **Idempotent checks** — running migrations against an already-migrated
   database is a no-op, not an error.
4. **No data loss without confirmation** — migrations that drop columns
   or tables require explicit `--destructive` flag.
```

### Manifest

```yaml
project:
  name: "db-migrate"
  type: cli

gates:
  test: "node --test tests/"

modules:
  - slug: core
    name: Migration Engine
    paths:
      - src/engine/
  - slug: cli
    name: CLI Interface
    paths:
      - src/cli/
  - slug: connectors
    name: Database Connectors
    paths:
      - src/connectors/
```

### Spec Example

Migration tool specs focus on ordering guarantees and data safety:

```markdown
## Behavioral Contract

### Behaviors
1. **When** `migrate up` runs **then** it applies all pending migrations
   in timestamp order and records each in the migrations table.
2. **When** `migrate down --steps 1` runs **then** it reverts only the
   most recent migration and updates the migrations table.
3. **When** a migration fails mid-execution **then** it rolls back that
   single migration and reports the error without affecting others.
```

---

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
