Updated the extracted Live Spec at [.context-index/specs/features/orders/fct-orders.md](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L1).

It now matches the current SQL behavior: the grain is explicitly one row per `order_id` ([L28](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L28)), the `LEFT JOIN` to `int_orders_pivoted_to_payments` is called out as a design decision with `NULL` implications for no-payment orders ([L26](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L26), [L43](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L43)), payment columns are documented as dollar-denominated via upstream cents-to-dollars conversion ([L49](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L49)), and the acceptance criteria are now concrete and testable ([L85](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/orders/fct-orders.md#L85)).

I also removed an inaccurate prior claim that `fct_orders` had no generic tests; the repo does define generic tests in `models/marts/_marts.yml`. Static verification is complete against the four upstream SQL files listed in the spec frontmatter. `dbt compile` could not be run here because `dbt` is not installed in this environment.
---

## Generated Files

### `.context-index/specs/features/orders/fct-orders.md`

```
---
charter: orders
status: extracted
created: 2026-03-31
mode: extract
extracted-from:
  - models/marts/fct_orders.sql
  - models/staging/stg_orders.sql
  - models/intermediate/int_orders_pivoted_to_payments.sql
  - models/staging/stg_payments.sql
---

# fct_orders — Order-Grain Fact Table

## Behavioral Contract

<!-- Extracted from existing code. Describes current behavior as of 2026-03-31. -->

`fct_orders` produces an order-grain fact table by selecting order attributes from `stg_orders` and attaching order-level payment amounts from `int_orders_pivoted_to_payments`.

| Source | Role |
|--------|------|
| `stg_orders` | Driving relation for the mart; one row per order |
| `int_orders_pivoted_to_payments` | One row per order with payment amounts pivoted into method-specific columns |

The mart joins `stg_orders` to `int_orders_pivoted_to_payments` with a `LEFT JOIN` on `order_id`. This is a deliberate design choice: orders are preserved even when no payment row exists, and missing payment matches surface as `NULL` in the payment columns.

## Grain

The model's grain is one row per `order_id`.

This follows from:
- `stg_orders` exposing one row per order
- `int_orders_pivoted_to_payments` aggregating to one row per order before the join
- the `LEFT JOIN` matching on `orders.order_id = payments.order_id`

## Behaviors

**When** a row exists in `stg_orders` **then** `fct_orders` emits exactly one row for that `order_id` with `order_id`, `customer_id`, `order_date`, and `order_status` copied from `stg_orders`.

**When** an order has one or more payment rows in `stg_payments` **then** `int_orders_pivoted_to_payments` aggregates those rows by `order_id` and `fct_orders` exposes the resulting `credit_card_amount`, `bank_transfer_amount`, `gift_card_amount`, and `total_amount`.

**When** an order has no matching row in `int_orders_pivoted_to_payments` **then** the order still appears in `fct_orders` and all four payment amount columns are `NULL`.

**When** an order has payments but none for a specific method **then** the corresponding method column is `0`, because the upstream pivot uses `sum(case when payment_method = ... then amount else 0 end)`.

**When** an order has payments across multiple methods **then** each method column contains the sum for that method and `total_amount` contains the sum of all payment amounts for the order.

## Column Semantics

| Column | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| order_id | stg_orders.order_id | string | Primary key |
| customer_id | stg_orders.customer_id | string | Foreign key to dim_customers |
| order_date | stg_orders.order_date | date | Date when order was placed |
| order_status | stg_orders.order_status | string | Order lifecycle status |
| credit_card_amount | int_orders_pivoted_to_payments.credit_card_amount | numeric | Sum of credit card payments for the order, in dollars |
| bank_transfer_amount | int_orders_pivoted_to_payments.bank_transfer_amount | numeric | Sum of bank transfer payments for the order, in dollars |
| gift_card_amount | int_orders_pivoted_to_payments.gift_card_amount | numeric | Sum of gift card payments for the order, in dollars |
| total_amount | int_orders_pivoted_to_payments.total_amount | numeric | Sum of all payment amounts for the order, in dollars |

Payment amount units are dollars, not cents. That conversion happens upstream in `stg_payments`, where `amount_cents` is transformed with `cents_to_dollars(...)` before the intermediate pivot aggregates the values.

## Edge Cases

| Condition | Observed Behavior | Status |
|-----------|-------------------|--------|
| Order with no payments | Order is preserved and payment columns are `NULL` | Expected from `LEFT JOIN` |
| Order with payments for only some methods | Present methods are summed; absent methods are `0` in the matched payment row | Expected from upstream pivot |
| Order with multiple payments of the same method | Method amount is the sum of those payment rows | Expected from upstream aggregation |
| Order with multiple payment methods | Each method is summed independently and `total_amount` sums all methods | Expected from upstream aggregation |

## Coverage Gaps

- No model-level test currently verifies that orders without payments remain present in `fct_orders` with `NULL` payment columns.
- No model-level test currently verifies that `total_amount` equals the sum of the three method-specific amount columns.
- No model-level test currently verifies the distinction between `NULL` payment columns for no-payment orders and `0` method amounts for matched payment rows without that method.

## Constitution Reference

- **Dimensional Modeling**: Compliant. `fct_orders` is a consumer-facing fact model at explicit order grain.
- **Testing Required**: Partially satisfied. Generic tests exist on key `fct_orders` columns, but the join and payment behaviors above are not directly asserted.
- **No Duplicate Logic**: Compliant. Payment pivoting is delegated to `int_orders_pivoted_to_payments` instead of being duplicated in the mart.

## Acceptance Criteria

1. Given the rows in `stg_orders`, `fct_orders` returns exactly one row per `order_id`.
2. `fct_orders.order_id`, `customer_id`, `order_date`, and `order_status` are sourced directly from `stg_orders`.
3. `fct_orders` joins `int_orders_pivoted_to_payments` with a `LEFT JOIN` on `order_id`, so every order from `stg_orders` is retained even if no payment row exists.
4. For an order with no matching payment row, `credit_card_amount`, `bank_transfer_amount`, `gift_card_amount`, and `total_amount` are `NULL`.
5. For an order with a matching payment row, each payment method column equals the summed dollar amount for that method, and `total_amount` equals the summed dollar amount across all payment rows for the order.
6. Payment amounts exposed by `fct_orders` are in dollars because `stg_payments` converts `amount_cents` to dollars before `int_orders_pivoted_to_payments` aggregates them.
```

