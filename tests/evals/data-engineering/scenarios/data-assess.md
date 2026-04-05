# Scenario: Assess a dbt project

## Skill
`/adev:assess --domain data`

## Target Project
`tests/evals/adev:data-eval` — E-commerce dbt + DuckDB project

## Prompt
Run `/adev:assess --domain data` against this project. The project contains:
- dbt project with staging/intermediate/marts model layers
- Airflow DAGs for orchestration
- Great Expectations expectation suites
- Terraform configuration for infrastructure
- 50 dbt tests (schema + custom data tests)
- Seed data (CSV files for customers, orders, products, payments)

## Expected Behavior
The skill should score the project across all 14 data domain dimensions (8 shared + 6 data-specific) and produce a maturity level. Given the project's comprehensive structure, it should score at least L3.

## Success Criteria
- All 6 data-specific dimensions are evaluated
- Maturity level is L3 or higher
- Specific, actionable improvement recommendations are provided
