[adev docs](../README.md) > [Project Types](../project-types.md) > Data Pipeline

# Data Pipeline (dbt + DuckDB)

**Repository:** [agentic-development/adev-data-eval](https://github.com/agentic-development/adev-data-eval)
**Fixture path:** `tests/evals/adev-data-eval/`

This is an e-commerce data engineering project built with dbt-core and DuckDB. It demonstrates how adev handles data transformation projects where the primary artifacts are SQL models, data tests, and pipeline orchestration.

## Tech Stack

- **Database:** DuckDB (zero-dependency, local)
- **Transformation:** dbt-core + dbt-duckdb
- **Orchestration:** Apache Airflow (DAG definitions)
- **Data Quality:** Great Expectations + dbt tests
- **Domain:** E-commerce (customers, orders, products, payments)

## How `/adev:init` Detects This Project Type

When `/adev:init` scans this project, it finds:

- `dbt_project.yml` — identifies it as a dbt project
- `requirements.txt` — Python dependencies
- `.python-version` — Python runtime
- `profiles.yml` — database connection configuration
- SQL files under `models/` — transformation layer

This detection drives the constitution and manifest generation.

## Constitution

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

## Manifest

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

## Charter Example

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

## Spec Example

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

## Project Structure

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

[Back to Project Types](../project-types.md)
