The failure mechanism is in [fct_orders.sql](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/models/marts/fct_orders.sql#L18): it does a `LEFT JOIN` from orders to [int_orders_pivoted_to_payments.sql](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/models/intermediate/int_orders_pivoted_to_payments.sql#L1) and used to project `payments.total_amount` directly. If an order has no matching payment aggregate row, `total_amount` becomes `NULL`. That matches the reported `not_null_fct_orders_total_amount` failure mode.

I checked the actual model code before changing anything, and I also checked the checked-in seed data. In this repo snapshot, every `raw_orders.id` has at least one matching `raw_payments.order_id`, so I could not reproduce the exact 3 orphan orders from the CSVs alone. That means there are two plausible paths:
- Model fix: default unmatched payment totals to zero. I implemented that in [fct_orders.sql](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/models/marts/fct_orders.sql#L18) with `coalesce(payments.total_amount, 0) as total_amount`.
- Data fix: investigate the runtime database state for the 3 orders that have no payment rows, if orders without payments should never exist.

Validation command is still `dbt test --select not_null_fct_orders_total_amount`. I could not run it here because `dbt` is not installed in the sandbox, and network restrictions prevented installing the package.
---

## Generated Files

### `models/marts/fct_orders.sql`

```
with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('int_orders_pivoted_to_payments') }}
),

final as (
    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        orders.order_status,
        payments.credit_card_amount,
        payments.bank_transfer_amount,
        payments.gift_card_amount,
        coalesce(payments.total_amount, 0) as total_amount
    from orders
    left join payments on orders.order_id = payments.order_id
)

select * from final
```

