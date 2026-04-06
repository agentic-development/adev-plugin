# Scenario: Debug a failing dbt test (NULL total_amount)

## Skill
`/adev:debug`

## Target Project
`tests/evals/adev:data-eval` — E-commerce dbt + DuckDB project

## Prompt
Debug this error: `dbt test not_null_fct_orders_total_amount failed: 3 rows with NULL total_amount found`

The error suggests some orders in fct_orders have NULL values in the total_amount column. This column comes from `int_orders_pivoted_to_payments` which aggregates payments per order.

## Expected Behavior
The skill should follow a systematic debugging approach:
1. Reproduce by running the test
2. Read fct_orders.sql and identify the LEFT JOIN to payment data
3. Check if orphan orders exist (orders with no payments)
4. Form a hypothesis: LEFT JOIN produces NULLs for unmatched orders
5. Propose a fix: COALESCE(payments.total_amount, 0) or investigate missing payment data
6. Validate by re-running the test

## Success Criteria
- Reads the actual model code before guessing
- Identifies the LEFT JOIN as the root cause mechanism
- Distinguishes between "fix the model" vs "fix the data" approaches
- Proposes re-running dbt test as validation
