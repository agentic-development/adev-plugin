# Data Engineering Maturity Assessment Report
## adev-data-eval Project

**Assessment Date:** March 30, 2026
**Project:** adev-data-eval (E-commerce Data Platform)
**Evaluator:** /adev-assess --domain data

## Executive Summary

The **adev-data-eval** project demonstrates **L3 (Managed) maturity** with strong foundational practices and well-organized data layering. The project successfully implements a three-tier dbt architecture (staging → intermediate → marts) with comprehensive test coverage, quality assurance via both dbt tests and Great Expectations, and orchestration via Apache Airflow.

**Overall Score: 71/100**
**Maturity Level: L3 (Managed)**

---

## Per-Dimension Summary Table

| Dimension | Score | Status | Priority |
|-----------|-------|--------|----------|
| 1. Test Infrastructure | 82 | Strong | Low |
| 2. Type Safety | 65 | Moderate | Medium |
| 3. Modularity | 78 | Strong | Low |
| 4. Documentation | 72 | Good | Medium |
| 5. Dependency Hygiene | 68 | Moderate | Medium |
| 6. Build Configuration | 76 | Good | Low |
| 7. Spec Sources | 42 | **Weak** | **HIGH** |
| 8. Naming Conventions | 88 | Excellent | Low |
| 9. Orchestration | 74 | Good | Medium |
| 10. Data Lineage | 58 | **Moderate** | **HIGH** |
| 11. Schema Management | 79 | Good | Low |
| 12. Data Quality | 76 | Good | Medium |
| 13. Infrastructure as Code | 0 | **Absent** | **CRITICAL** |
| 14. Metadata | 54 | **Weak** | **HIGH** |
| **OVERALL** | **71** | **L3** | — |

---

## Detailed Dimension Scores

### 1. Test Infrastructure — 82/100
50 total tests. Comprehensive unique, not_null, relationships, accepted_values across all layers. 2 custom singular tests. Great Expectations adds depth with 2 configured suites.
**Gaps:** No freshness tests, GE covers only 2 of 4 raw tables (missing raw_payments, raw_products), no CI pipeline.

### 2. Type Safety — 65/100
Explicit cast(... as date) in staging. cents_to_dollars macro ensures numeric precision.
**Gaps:** No dbt contracts or column-level type specs. No contract: enforced on any model.

### 3. Modularity — 78/100
Clean three-layer architecture. Each layer has its own schema YAML. Reusable macro.
**Gaps:** Only one macro. No _sources.yml defining dbt sources.

### 4. Documentation — 72/100
All models have descriptions. Column descriptions in staging and marts. ERD in docs/erd.md. Good README.
**Gaps:** No dbt docs generation. No data dictionary.

### 5. Dependency Hygiene — 68/100
Single dbt package: dbt-labs/dbt_utils. package-lock.yml present.
**Gaps:** dbt_utils version range too broad. dbt_utils is installed but unused in any model or macro.

### 6. Build Configuration — 76/100
Proper materialization per layer. Dual targets (dev/prod). Init scripts.
**Gaps:** Both targets use local DuckDB. No incremental materializations.

### 7. Spec Sources — 42/100
Models use ref() for dependency tracking.
**Gaps:** NO dbt source blocks defined. No freshness checks. No source() macro usage.

### 8. Naming Conventions — 88/100
Excellent consistency: stg_, int_, fct_, dim_ prefixes. Snake_case throughout. Clear column renaming at staging.
**Gaps:** No documented naming standard.

### 9. Orchestration — 74/100
Two DAGs: dbt_daily_run (daily at 06:00) and data_quality_check (daily at 08:00). Proper task chain with retries and email alerts.
**Gaps:** Uses BashOperator not dedicated dbt operators. Hardcoded paths. No cross-DAG dependency.

### 10. Data Lineage — 58/100
All refs correct. Relationships tests enforce FK integrity. ERD diagram.
**Gaps:** Missing source() usage breaks source-level lineage. No exposures defined.

### 11. Schema Management — 79/100
Per-layer schema targeting. Comprehensive YAML schema files.
**Gaps:** No contract: enforced. No column data_type declarations.

### 12. Data Quality — 76/100
50 dbt tests. Custom SQL assertions. GE suites for raw_customers and raw_orders.
**Gaps:** GE missing for 2 of 4 tables. No anomaly detection. dbt_utils tests unused despite package being installed.

### 13. Infrastructure as Code — 0/100
No Terraform, CloudFormation, or equivalent. DuckDB is local-only.

### 14. Metadata — 54/100
Model and column descriptions in YAML. Version tracking.
**Gaps:** No meta blocks. No exposures. No ownership or PII tags.

---

## Improvement Recommendations

1. **Create _sources.yml** with dbt source blocks for all 4 raw tables. Add source freshness SLAs.
2. **Enable model contracts** (dbt 1.5+) with explicit data_type on mart columns.
3. **Complete GE coverage** — add suites for raw_payments and raw_products.
4. **Add metadata** — meta blocks with owner, PII classification, SLAs on models.
5. **Use or remove dbt_utils** — leverage expression_is_true, accepted_range tests, or remove unused dependency.
6. **Add CI/CD** — GitHub Actions running dbt build on PRs.
