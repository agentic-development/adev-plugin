# Scenario: Generate architecture docs for a dbt project

## Skill
`/adev-document`

## Target Project
`tests/evals/adev-data-eval` — E-commerce dbt + DuckDB project

## Prompt
Generate architecture documentation for this dbt project. Cover the model layers, data flow from seeds to marts, key transformations, and testing strategy.

The project has:
- 4 seeds (raw_customers, raw_orders, raw_products, raw_payments)
- 4 staging models (views, 1:1 with seeds)
- 2 intermediate models (payment pivoting, customer order history)
- 3 mart models (fct_orders, dim_customers, dim_products)
- 50 dbt tests + 2 custom data tests
- 1 SCD Type 2 snapshot
- Airflow DAGs and Great Expectations config

## Expected Behavior
The skill should produce documentation that:
- Maps the three-layer architecture with model names
- Shows the data flow (seeds → staging → intermediate → marts)
- Documents key transformations (cents_to_dollars, payment pivoting, customer aggregation)
- Lists the testing and quality assurance strategy

## Success Criteria
- Accurately reflects the project structure
- Uses dbt terminology (models, sources, refs, materializations)
- Includes a visual or text-based data flow diagram
- Would be useful for onboarding a new team member
