I couldn’t invoke `/adev-assess` directly from the active skill list in this session, so I applied the `adev-assess` data-domain rubric from the parent plugin repo to the actual contents of this project. On the requested 14-dimension data rubric, this project scores **65/100**, which is **L4 - Ready**. That exceeds the requested L3 floor. One important note: despite the scenario text, I did **not** find any Terraform in this repo, so Infrastructure as Code scored `0`.

| Dimension | Score | Notes |
|-----------|------:|-------|
| Test Infrastructure | 82 | Strong dbt test coverage plus singular tests and GE suites |
| Type Safety | 62 | Good casting discipline/macros, but no dbt contracts or `data_type` enforcement |
| Modularity | 88 | Clear `staging` / `intermediate` / `marts` layering with small focused models |
| Documentation | 76 | Good README, architecture doc, ERD |
| Dependency Hygiene | 68 | Lean deps and lock file, but `dbt_utils` is installed and appears unused |
| Build Configuration | 78 | `dbt_project.yml`, profiles, init script, quality script, Airflow DAGs |
| Spec Sources | 46 | Good docs, but no `_sources.yml`, no `source()`, no freshness, no exposures |
| Naming Conventions | 92 | Consistent `stg_` / `int_` / `fct_` / `dim_` prefixes |
| Orchestration | 70 | Two Airflow DAGs with schedules/retries; hardcoded paths and BashOperators |
| Data Lineage | 52 | Good `ref()` usage between models, but raw lineage is weak because `source()` is missing |
| Schema Management | 72 | Per-layer YAML and column docs/tests, but no contracts or column `data_type` |
| Data Quality | 76 | 51 dbt tests by static count plus 2 GE suites and a snapshot |
| Infrastructure as Code | 0 | No Terraform or equivalent found |
| Metadata | 54 | Descriptions exist, but no `meta`, ownership, SLA, PII, or exposures |

The main evidence came from [README.md:5](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/README.md#L5), [docs/architecture.md:136](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/docs/architecture.md#L136), [dags/dbt_daily_run.py:22](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/dags/dbt_daily_run.py#L22), [dags/data_quality_check.py:20](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/dags/data_quality_check.py#L20), [models/staging/_staging.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/staging/_staging.yml#L3), and [models/marts/_marts.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/_marts.yml#L3).

Most important gaps:
- Raw tables are referenced with `ref('raw_*')` in staging models like [stg_customers.sql:1](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/staging/stg_customers.sql#L1) and [stg_orders.sql:1](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/staging/stg_orders.sql#L1), but there is no `_sources.yml` and no `source()` usage.
- Great Expectations covers only `raw_customers` and `raw_orders` via [raw_customers_suite.json](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/great_expectations/expectations/raw_customers_suite.json) and [raw_orders_suite.json](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/great_expectations/expectations/raw_orders_suite.json); `raw_payments` and `raw_products` are missing.
- The quality DAG references `raw_customers_checkpoint` and `raw_orders_checkpoint` in [data_quality_check.py:29](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/dags/data_quality_check.py#L29), but I did not find checkpoint definitions under [great_expectations/great_expectations.yml:1](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/great_expectations/great_expectations.yml#L1) or elsewhere in `great_expectations/`.
- `dbt_utils` is declared in [packages.yml:1](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/packages.yml#L1), but I did not find actual `dbt_utils` usage in models/macros/tests. Separately, [docs/architecture.md:148](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/docs/architecture.md#L148) claims `recency` and `expression_is_true` tests that are not present in [models/marts/_marts.yml:42](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/_marts.yml#L42).
- No dbt model contracts are enforced in [models/staging/_staging.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/staging/_staging.yml#L3) or [models/marts/_marts.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/_marts.yml#L3).

Top improvements:
1. Add `models/staging/_sources.yml` and switch staging models from `ref('raw_*')` to `source()`. This lifts Data Lineage and Spec Sources immediately and makes [dbt_daily_run.py:36](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/dags/dbt_daily_run.py#L36) meaningful.
2. Add dbt contracts and explicit `data_type` declarations in [models/marts/_marts.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/_marts.yml#L3) and, where useful, [models/staging/_staging.yml:3](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/staging/_staging.yml#L3).
3. Complete GE coverage for `raw_payments` and `raw_products`, and add the missing checkpoint configuration used by [dags/data_quality_check.py:29](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/dags/data_quality_check.py#L29).
4. Either remove `dbt_utils` from [packages.yml:1](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/packages.yml#L1) or actually use it for recency/business-rule tests, then fix the drift in [docs/architecture.md:148](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/docs/architecture.md#L148).
5. If production readiness is a goal, add actual IaC for Airflow/dbt runtime provisioning; right now the repo’s maturity is being pulled down by a literal `0/100` on that dimension.

If you want, I can turn this into a saved `docs/assessment.md` scorecard in the project.