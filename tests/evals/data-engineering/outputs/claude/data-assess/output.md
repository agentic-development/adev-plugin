48 schema tests + 2 custom data tests = 50 total tests. Now I have everything needed.

---

# Codebase Readiness Assessment

**Total Score:** 55/100 (L3 - Defined)
**Mode:** data domain
**Assessed:** 2026-05-11T00:00:00Z
**Target:** `tests/evals/adev-data-eval`

## Shared Dimensions (8)

| Dimension | Score | Indicator |
|-----------|-------|-----------|
| Test Infrastructure | 75 | `████████░░` |
| Type Safety | 40 | `████░░░░░░` |
| Modularity | 80 | `████████░░` |
| Naming | 85 | `█████████░` |
| Documentation | 65 | `██████░░░░` |
| Dependency Hygiene | 55 | `██████░░░░` |
| Build Configuration | 50 | `█████░░░░░` |
| Spec Sources | 40 | `████░░░░░░` |

## Data-Specific Dimensions (6)

| Dimension | Score | Indicator |
|-----------|-------|-----------|
| Data Modeling & Lineage | 55 | `██████░░░░` |
| Data Quality & Testing | 60 | `██████░░░░` |
| Orchestration | 70 | `███████░░░` |
| Infrastructure as Code | 0 | `░░░░░░░░░░` |
| Data Contracts & Schema Governance | 20 | `██░░░░░░░░` |
| Observability & Monitoring | 35 | `████░░░░░░` |

---

## Dimension Evidence & Scoring Rationale

### Shared Dimensions

**Test Infrastructure — 75**
- 50 total dbt tests: 48 schema tests across `_staging.yml` (27), `_intermediate.yml` (4), `_marts.yml` (17), plus 2 custom data tests (`tests/assert_orders_have_valid_status.sql`, `tests/assert_positive_order_amounts.sql`).
- Great Expectations suites provide additional validation layer (`raw_customers_suite.json`, `raw_orders_suite.json`).
- Helper script `scripts/run_quality_checks.sh` for running tests.
- Gap: No CI pipeline defined; tests must be run manually or via Airflow DAG.

**Type Safety — 40**
- SQL is inherently untyped, but the project uses explicit `cast()` operations in staging models for date columns.
- Column descriptions and `accepted_values` tests provide some type constraint.
- No dbt model contracts (dbt 1.5+ feature) to enforce column types at build time.

**Modularity — 80**
- Clean three-layer architecture: staging (4 models) → intermediate (2 models) → marts (3 models).
- Clear separation of concerns: each layer has its own directory and schema config.
- Additional separation for macros, snapshots, analyses, seeds, and DAGs.
- All SQL files are small (<30 lines), single-responsibility.

**Naming — 85**
- Excellent, consistent prefix convention across layers: `stg_` (staging), `int_` (intermediate), `fct_` (fact), `dim_` (dimension).
- Schema YAML files use consistent `_staging.yml`, `_intermediate.yml`, `_marts.yml` naming.
- Column naming is descriptive and consistent (e.g., `customer_id`, `order_date`, `payment_method`).
- Seeds use `raw_` prefix consistently.

**Documentation — 65**
- README.md with stack overview, data model description, quick start, and project structure.
- ERD diagram in `docs/erd.md` with relationship table.
- Every model and most columns have descriptions in YAML schema files.
- Gap: No auto-generated dbt docs site (`dbt docs generate`), no column-level documentation for some intermediate/mart columns.

**Dependency Hygiene — 55**
- `requirements.txt` with pinned version ranges for `dbt-core`, `dbt-duckdb`, and `great-expectations`.
- `packages.yml` declares `dbt_utils` dependency with version constraint.
- `package-lock.yml` provides reproducibility with SHA hash.
- Gap: `dbt_utils` package is installed but unused — no model or macro references `dbt_utils` anywhere in the codebase. This is dead weight that should be removed from `packages.yml`.

**Build Configuration — 50**
- `dbt_project.yml` properly configures materializations per layer.
- `profiles.yml` has dev and prod targets.
- Helper scripts (`init_duckdb.sh`, `run_quality_checks.sh`) for common operations.
- Gap: No linter (e.g., sqlfluff), no pre-commit hooks, no CI/CD pipeline configuration.

**Spec Sources — 40**
- `docs/erd.md` provides architectural context.
- `analyses/` directory contains 2 ad-hoc analytical queries.
- Gap: No ADRs, no formal specs, no architecture decision records explaining design choices.

### Data-Specific Dimensions

**Data Modeling & Lineage — 55**
- Well-structured three-layer dbt model (staging → intermediate → marts) following medallion architecture.
- All models use `{{ ref() }}` for inter-model dependencies, enabling DAG construction.
- Critical gap: **No `source()` declarations exist.** Staging models reference seeds via `{{ ref('raw_customers') }}` rather than declaring a `_sources.yml` file and using `{{ source('raw', 'raw_customers') }}`. This means:
  - No source freshness checks are possible.
  - dbt's lineage graph doesn't trace back to the raw data layer.
  - No source-level documentation or tests.
- Missing `_sources.yml` file should be added to formalize the raw→staging boundary.

**Data Quality & Testing — 60**
- Strong dbt test coverage: uniqueness, not-null, accepted_values, and relationships tests across all layers.
- 2 custom data tests for business logic validation (valid statuses, positive amounts).
- Great Expectations provides supplementary validation for `raw_customers` and `raw_orders`.
- Gap: Great Expectations covers only **2 of 4 raw tables** — `raw_payments` and `raw_products` are missing expectation suites. This leaves half the raw data unvalidated by GE.
- No data freshness checks (no source freshness in dbt, no freshness expectations in GE).

**Orchestration — 70**
- Two well-structured Airflow DAGs:
  - `dbt_daily_run` (`schedule_interval="0 6 * * *"`): Full pipeline with `seed → test_sources → run_staging → run_intermediate → run_marts → test_models → snapshot`. Uses `BashOperator` for each step.
  - `data_quality_check` (`schedule_interval="0 8 * * *"`): Runs GE checkpoints for customers and orders validation.
- Proper task dependencies with retry configuration (2 retries, 5-minute delay).
- Email alerting on failure configured (`data-alerts@example.com`).
- Gap: DAGs are not integrated (quality check runs independently of dbt pipeline). No sensor waiting for dbt completion before running GE checks.

**Infrastructure as Code — 0**
- No Terraform, CloudFormation, Pulumi, or any IaC configuration found in the project.
- No infrastructure definition files (`.tf`, `.yaml` for k8s, etc.).
- The project runs entirely on local DuckDB, so IaC isn't strictly required for this scope, but there's no provisioning for the Airflow environment either.

**Data Contracts & Schema Governance — 20**
- Column descriptions exist in YAML schema files, providing informal documentation.
- `accepted_values` tests enforce enum constraints on certain columns.
- No dbt model contracts (dbt 1.5+ `contract: {enforced: true}` configuration) — column types and constraints are not enforced at build time.
- No formal data contract definitions between producers and consumers.
- No schema evolution strategy or versioning.

**Observability & Monitoring — 35**
- Airflow DAG provides basic execution monitoring (success/failure).
- Email alerting on DAG failure is configured.
- Great Expectations generates validation results.
- Gap: No data observability platform integration (e.g., Monte Carlo, Elementary, re_data). No freshness monitoring. No anomaly detection. No dbt artifacts exposure for downstream monitoring.

---

## Top Recommendations

1. **Add `_sources.yml` to formalize source declarations** — Create `models/staging/_sources.yml` with `source()` definitions for all 4 raw tables. Replace `{{ ref('raw_customers') }}` with `{{ source('raw', 'raw_customers') }}` in staging models. This enables source freshness checks and completes the lineage graph.

2. **Remove unused `dbt_utils` from `packages.yml`** — The `dbt-labs/dbt_utils` package is installed but never referenced in any model, macro, or test. Remove it to reduce dependency footprint and speed up `dbt deps`.

3. **Add Great Expectations suites for `raw_payments` and `raw_products`** — Only `raw_customers` and `raw_orders` have expectation suites. Add `raw_payments_suite.json` and `raw_products_suite.json` under `great_expectations/expectations/` to achieve full raw-layer validation coverage.

4. **Enable dbt model contracts on mart models** — Add `contract: {enforced: true}` to `_marts.yml` for `fct_orders`, `dim_customers`, and `dim_products`. This enforces column names and types at build time, preventing schema drift.

5. **Add a SQL linter** — Configure `sqlfluff` with a `.sqlfluff` config file and add a lint step to `scripts/` or as a pre-commit hook. This catches style inconsistencies and SQL anti-patterns automatically.

6. **Link Airflow DAGs** — Add an `ExternalTaskSensor` in `data_quality_check` DAG to wait for `dbt_daily_run` completion before running GE validations, ensuring quality checks always run against fresh data.
