# Data Engineering Maturity Assessment

**Project:** adev-data-eval
**Domain:** E-commerce (customers, orders, products, payments)
**Stack:** dbt-core + dbt-duckdb, Apache Airflow, Great Expectations
**Date:** 2026-03-30

---

## Overall Score: 62 / 100

## Maturity Level: L3 -- Defined

The project demonstrates a well-structured dbt project with proper layering, solid schema tests, and orchestration definitions. However, it lacks source declarations, CI/CD configuration, Infrastructure as Code, freshness checks, and has gaps in data quality coverage and metadata management.

---

## Per-Dimension Scores

### 1. Test Infrastructure -- 65/100

**Evidence:**
- 2 custom singular dbt tests in `tests/` (`assert_orders_have_valid_status.sql`, `assert_positive_order_amounts.sql`)
- Extensive schema-level tests in all three YAML files: `unique`, `not_null`, `accepted_values`, `relationships` across staging, intermediate, and marts layers
- Total schema tests: ~40+ column-level tests defined across `_staging.yml`, `_intermediate.yml`, `_marts.yml`
- `run_quality_checks.sh` script runs `dbt test`

**Gaps:**
- No unit tests for macros (e.g., testing `cents_to_dollars` directly)
- No test for data freshness or volume anomalies
- Great Expectations suites exist but only for 2 of 4 raw tables (missing `raw_payments`, `raw_products`)
- No CI pipeline to run tests automatically

### 2. Type Safety -- 55/100

**Evidence:**
- Explicit `cast(... as date)` in staging models for date columns
- `cents_to_dollars` macro applies `round(... / 100.0, 2)` ensuring numeric precision
- Consistent renaming at staging layer

**Gaps:**
- No explicit column type definitions in YAML schema files
- No `contract: enforced` on any model (dbt 1.5+ feature)

### 3. Modularity -- 80/100

**Evidence:**
- Clean three-layer architecture: staging (4 models) -> intermediate (2 models) -> marts (3 models)
- Each layer has its own schema YAML file
- Reusable macro `cents_to_dollars` extracted to `macros/`
- Analyses separated into `analyses/` directory

**Gaps:**
- Only one macro
- No `_sources.yml` file defining dbt sources

### 4. Documentation -- 70/100

**Evidence:**
- Every model has a `description` in its YAML schema file
- Every column in staging and marts has a `description`
- ERD diagram in `docs/erd.md`
- README with project structure, quick start, and environment profiles

**Gaps:**
- No `dbt docs generate` integration
- No data dictionary or glossary

### 5. Dependency Hygiene -- 60/100

**Evidence:**
- Single external dbt package: `dbt-labs/dbt_utils >=1.1.0`
- `package-lock.yml` present with SHA hash
- `requirements.txt` with version ranges

**Gaps:**
- `dbt_utils` version range is very broad
- `dbt_utils` appears unused in any model or macro

### 6. Build Configuration -- 65/100

**Evidence:**
- `dbt_project.yml` properly configures materialization per layer
- Two target profiles: `dev` and `prod` in `profiles.yml`
- Init script with `set -euo pipefail`

**Gaps:**
- Both dev and prod use local DuckDB files
- No incremental materializations

### 7. Spec Sources -- 30/100

**Evidence:**
- Seeds serve as the raw data layer with 4 CSV files

**Gaps:**
- No `sources` block defined anywhere -- uses `ref()` to seeds instead of `source()`
- No source freshness tests

### 8. Naming Conventions -- 85/100

**Evidence:**
- Consistent `stg_`, `int_`, `fct_`, `dim_` prefixes
- `raw_` prefix on all seed files
- Snake_case throughout

### 9. Orchestration -- 60/100

**Evidence:**
- Two Airflow DAGs: `dbt_daily_run` (daily at 06:00) and `data_quality_check` (daily at 08:00)
- Proper execution order: seed -> test sources -> run staging -> run intermediate -> run marts -> test models -> snapshot
- Proper `default_args` with retries and email alerting

**Gaps:**
- Uses `BashOperator` instead of dedicated dbt operators
- No cross-DAG dependency
- Hardcoded paths

### 10. Data Lineage -- 55/100

**Evidence:**
- All model-to-model dependencies use `{{ ref() }}` correctly
- `relationships` tests enforce referential integrity
- ERD documents lineage visually

**Gaps:**
- No `source()` macro usage
- No exposure definitions

### 11. Schema Management -- 70/100

**Evidence:**
- Per-layer schema targeting in `dbt_project.yml`
- Model YAML files define column structure for all layers

**Gaps:**
- No `contract: enforced`
- No column-level `data_type` declarations

### 12. Data Quality -- 60/100

**Evidence:**
- dbt schema tests across all layers
- 2 custom singular tests
- GE expectation suites for `raw_customers` and `raw_orders`

**Gaps:**
- GE suites missing for `raw_payments` and `raw_products`
- No GE checkpoints defined
- `dbt_utils` tests unused despite package being installed

### 13. Infrastructure as Code -- 0/100

**Gaps:**
- No Terraform, CloudFormation, or any IaC files
- DuckDB is local-only

### 14. Metadata -- 35/100

**Evidence:**
- Model and column descriptions in YAML files

**Gaps:**
- No `meta` blocks on any model
- No exposure definitions
- No data catalog integration

---

## Score Summary

| # | Dimension | Score |
|---|-----------|-------|
| 1 | Test Infrastructure | 65 |
| 2 | Type Safety | 55 |
| 3 | Modularity | 80 |
| 4 | Documentation | 70 |
| 5 | Dependency Hygiene | 60 |
| 6 | Build Configuration | 65 |
| 7 | Spec Sources | 30 |
| 8 | Naming Conventions | 85 |
| 9 | Orchestration | 60 |
| 10 | Data Lineage | 55 |
| 11 | Schema Management | 70 |
| 12 | Data Quality | 60 |
| 13 | Infrastructure as Code | 0 |
| 14 | Metadata | 35 |
| | **Overall** | **62** |

---

## Top Improvement Recommendations

1. **Add dbt source declarations** -- Create `_sources.yml` with `source()` macros and freshness tests
2. **Enable model contracts** -- Add `contract: enforced` with explicit `data_type` on mart columns
3. **Complete Great Expectations coverage** -- Add suites for `raw_payments` and `raw_products`
4. **Add metadata and exposures** -- Add `meta` blocks with ownership and PII classification
5. **Leverage dbt_utils** -- Use `expression_is_true`, `accepted_range` tests or remove the unused package
6. **Add CI/CD pipeline** -- GitHub Actions running `dbt build` on PRs
