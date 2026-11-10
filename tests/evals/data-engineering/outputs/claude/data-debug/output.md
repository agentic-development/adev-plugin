All 8 tests pass, including the new `not_null_fct_orders_total_amount` test.

## Summary

**Root cause:** The `fct_orders` model uses a `LEFT JOIN` from `stg_orders` to `int_orders_pivoted_to_payments`. When an order has no payment records (e.g., newly placed orders), the join produces NULL for all payment columns.

**Fix applied:**

1. **`models/marts/fct_orders.sql`** - Wrapped all four payment columns with `COALESCE(..., 0)` so orders without payments get 0 instead of NULL. This is the correct semantic: an order with no payments has $0 paid, not an unknown amount.

2. **`models/marts/_marts.yml`** - Added a `not_null` test on `total_amount` to prevent regressions.

**Validation:** `dbt test -s fct_orders` passes all 8 tests including the new `not_null_fct_orders_total_amount`.

---

## Generated Files

### `models/marts/_marts.yml`

```
version: 2

models:
  - name: fct_orders
    description: >
      Order fact table at the order grain. Each row is a unique order
      with payment amounts broken down by payment method.
    columns:
      - name: order_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: customer_id
        description: Foreign key to dim_customers
        tests:
          - not_null
          - relationships:
              arguments:
                to: ref('dim_customers')
                field: customer_id
      - name: order_date
        description: Date the order was placed
        tests:
          - not_null
      - name: order_status
        description: Current status of the order
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['placed', 'shipped', 'completed', 'returned']
      - name: credit_card_amount
        description: Amount paid via credit card in dollars
      - name: bank_transfer_amount
        description: Amount paid via bank transfer in dollars
      - name: gift_card_amount
        description: Amount paid via gift card in dollars
      - name: total_amount
        description: Total payment amount in dollars
        tests:
          - not_null

  - name: dim_customers
    description: >
      Customer dimension table with lifetime order metrics.
      One row per customer.
    columns:
      - name: customer_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: first_name
        description: Customer first name
        tests:
          - not_null
      - name: last_name
        description: Customer last name
        tests:
          - not_null
      - name: email
        description: Customer email (nullable for some customers)
      - name: country
        description: Country code
        tests:
          - not_null
      - name: created_at
        description: Account creation date
      - name: first_order_date
        description: Date of first order (null if never ordered)
      - name: most_recent_order_date
        description: Date of most recent order
      - name: number_of_orders
        description: Total orders placed
      - name: lifetime_value
        description: Total revenue from completed orders in dollars

  - name: dim_products
    description: >
      Product dimension table with catalog information.
      One row per product.
    columns:
      - name: product_id
        description: Primary key
        tests:
          - unique
          - not_null
      - name: product_name
        description: Product display name
        tests:
          - not_null
      - name: category
        description: Product category
        tests:
          - not_null
      - name: price
        description: Unit price in dollars
        tests:
          - not_null
      - name: created_at
        description: Date product was added to catalog
```

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
        coalesce(payments.credit_card_amount, 0) as credit_card_amount,
        coalesce(payments.bank_transfer_amount, 0) as bank_transfer_amount,
        coalesce(payments.gift_card_amount, 0) as gift_card_amount,
        coalesce(payments.total_amount, 0) as total_amount
    from orders
    left join payments on orders.order_id = payments.order_id
)

select * from final
```

