# Scenario: Reverse-engineer a spec from fct_orders

## Skill
`/adev:specify --extract`

## Target Project
`tests/evals/adev:data-eval` — E-commerce dbt + DuckDB project

## Prompt
Reverse-engineer a Live Spec from the existing `fct_orders` mart model at `models/marts/fct_orders.sql`.

The model joins `stg_orders` with `int_orders_pivoted_to_payments` to produce an order-grain fact table with payment amounts broken down by method (credit_card, bank_transfer, gift_card).

## Expected Behavior
The skill should read fct_orders.sql, trace its upstream dependencies, and produce a behavioral spec documenting:
- The grain (one row per order)
- The LEFT JOIN to payment pivot
- Column semantics (amounts in dollars, converted from cents upstream)
- Edge cases (orders with no payments → NULL amounts)

## Success Criteria
- Accurately describes what the model does, not what it should do
- Documents the grain explicitly
- Identifies the LEFT JOIN as a design decision with implications
- Produces testable acceptance criteria
