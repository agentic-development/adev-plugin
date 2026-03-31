# DEBUG REPORT: dbt Test Failure - "not_null_fct_orders_total_amount"

## 1. REPRODUCE THE TEST FAILURE

Run the failing test:
```bash
dbt test --select fct_orders -k "not_null_fct_orders_total_amount"
```

Expected error: 3 rows with NULL total_amount found.

## 2. INVESTIGATE THE DATA FLOW

The pipeline is:

```
raw_orders (seed) --> stg_orders --> fct_orders
raw_payments (seed) --> stg_payments --> int_orders_pivoted_to_payments --> fct_orders
```

**stg_orders.sql** — selects from raw_orders, renames columns, converts cents to dollars.

**stg_payments.sql** — selects from raw_payments, renames columns, converts cents to dollars.

**int_orders_pivoted_to_payments.sql** — pivots stg_payments by payment_method using CASE/SUM, groups by order_id. Only produces rows for order_ids that EXIST in stg_payments.

**fct_orders.sql** (the bug location):
```sql
from orders
left join payments on orders.order_id = payments.order_id
```

This uses a LEFT JOIN from stg_orders to int_orders_pivoted_to_payments. Any order with no matching payment rows will have NULL for all payment columns.

## 3. HYPOTHESIS

Orders that exist in raw_orders but have no corresponding rows in raw_payments will produce NULL total_amount in fct_orders because of the LEFT JOIN.

The most probable cause: The three orders have no matching payment records in stg_payments, causing the GROUP BY in int_orders_pivoted_to_payments to exclude them entirely.

## 4. VERIFY THE HYPOTHESIS

Diagnostic SQL query:

```sql
SELECT
  o.order_id,
  o.customer_id,
  o.order_date,
  o.order_status,
  p.total_amount
FROM stg_orders o
LEFT JOIN int_orders_pivoted_to_payments p
  ON o.order_id = p.order_id
WHERE p.total_amount IS NULL
ORDER BY o.order_id;
```

Alternative to count:
```sql
SELECT COUNT(*) as orders_with_null_total_amount
FROM fct_orders
WHERE total_amount IS NULL;
```

To find orders missing from payments:
```sql
SELECT DISTINCT o.order_id
FROM stg_orders o
LEFT JOIN stg_payments p ON o.order_id = p.order_id
WHERE p.order_id IS NULL
ORDER BY o.order_id;
```

## 5. PROPOSED FIX

In models/marts/fct_orders.sql, wrap all four payment columns in COALESCE:

```sql
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
```

Rationale: An order with no payments has $0, not NULL. All four payment columns should use COALESCE for consistency.

## 6. VALIDATE THE FIX

```bash
dbt run --select fct_orders
dbt test --select fct_orders -k "not_null_fct_orders_total_amount"
```

## SUMMARY

| Step | Finding |
|---|---|
| Root cause | LEFT JOIN in fct_orders.sql produces NULL payment columns for orders without payments |
| Affected rows | 3 orders with NULL total_amount |
| Fix | Wrap all four payment columns in COALESCE(..., 0) |
| File to change | models/marts/fct_orders.sql |
