# Scenario: Write dbt tests for dim_customers

## Skill
`/adev:write-test --red`

## Target Project
`tests/evals/adev:data-eval` — E-commerce dbt + DuckDB project

## Prompt
Write data quality tests for the `dim_customers` mart model at `models/marts/dim_customers.sql`. The model joins `stg_customers` with `int_customer_order_history` to produce a customer dimension with lifetime metrics.

Key columns: customer_id, first_name, last_name, email (nullable), country, created_at, first_order_date, most_recent_order_date, number_of_orders, lifetime_value.

## Expected Behavior
The skill should produce dbt-idiomatic tests:
- Schema tests in _marts.yml format (unique, not_null, accepted_values, relationships)
- Custom data tests as SQL files (e.g., assert lifetime_value >= 0)
- Tests should use deterministic seed data, not runtime assumptions

## Success Criteria
- Uses dbt test patterns, not raw SQL assertions
- Covers both schema constraints and business logic
- Tests edge cases (customers with no orders, NULL emails)
- No gaming violations (no loose assertions like count > 0)
