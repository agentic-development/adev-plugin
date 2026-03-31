# Debugging Report: `not_null_fct_orders_total_amount`

## 1. Reproduce

Run the failing test:
```bash
dbt test --select not_null_fct_orders_total_amount
```

Expected: 0 rows returned. Actual: 3 rows with NULL `total_amount`.

## 2. Data Flow Investigation

The pipeline is:

```
raw_orders (seed) --> stg_orders --> fct_orders
raw_payments (seed) --> stg_payments --> int_orders_pivoted_to_payments --> fct_orders
```

**`stg_orders.sql`** -- selects from `raw_orders`, renames columns, converts `total_amount_cents` to dollars via the `cents_to_dollars` macro.

**`stg_payments.sql`** -- selects from `raw_payments`, renames columns, converts `amount_cents` to dollars.

**`int_orders_pivoted_to_payments.sql`** -- pivots `stg_payments` by `payment_method`, producing per-order columns `credit_card_amount`, `bank_transfer_amount`, `gift_card_amount`, and `total_amount`. Groups by `order_id`. **Only orders that exist in `stg_payments` get a row here.**

**`fct_orders.sql`** (the bug location):
```sql
from orders
left join payments on orders.order_id = payments.order_id
```

This uses a **LEFT JOIN** from `stg_orders` to `int_orders_pivoted_to_payments`. Any order that has no matching payment rows will have NULL for all payment columns including `total_amount`.

## 3. Hypothesis

Orders that exist in `raw_orders` but have **no corresponding rows in `raw_payments`** will produce NULL `total_amount` in `fct_orders` because of the LEFT JOIN.

The root cause is that `fct_orders.sql` does not use `COALESCE` on the payment columns from the LEFT JOIN.

The seed data contains exactly **3 orders with status `placed`** (order IDs 53, 57, 89). In a production environment, these freshly placed orders would likely have no payments yet, producing the 3 NULL rows observed.

## 4. Verification Query

```sql
SELECT
    o.order_id,
    o.order_status,
    p.order_id as payment_order_id,
    p.total_amount
FROM main_staging.stg_orders o
LEFT JOIN main_intermediate.int_orders_pivoted_to_payments p
    ON o.order_id = p.order_id
WHERE p.total_amount IS NULL
```

Expected result: 3 rows, all with `order_status = 'placed'`.

## 5. Proposed Fix

In `models/marts/fct_orders.sql`, wrap all payment columns in `COALESCE`:

```sql
final as (
    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        orders.order_status,
        coalesce(payments.credit_card_amount, 0) as credit_card_amount,
        coalesce(payments.bank_transfer_amount, 0) as bank_transfer_amount,
        coalesce(payments.gift_card_amount, 0) as gift_card_amount,
        coalesce(payments.total_amount, 0) as total_amount
    from orders
    left join payments on orders.order_id = payments.order_id
)
```

An order with no payments has a total amount of $0, not NULL. The LEFT JOIN is correct (we want all orders), but NULL propagation must be handled.

## 6. Validate

After applying the fix:
```bash
dbt run --select fct_orders
dbt test --select not_null_fct_orders_total_amount
```

Also add `not_null` tests for `credit_card_amount`, `bank_transfer_amount`, and `gift_card_amount` in `_marts.yml`.

## Summary

| Step | Finding |
|---|---|
| Root cause | LEFT JOIN in fct_orders.sql produces NULL payment columns for orders without payments |
| Affected rows | 3 orders (status `placed`: IDs 53, 57, 89) |
| Fix | Wrap payment columns in `COALESCE(..., 0)` |
| File to change | `models/marts/fct_orders.sql` |
