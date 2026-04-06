The skill `/adev:test-write` is not available. Let me explore the project and write the dbt tests directly.
Now I'll add more schema tests and a custom generic test for the date logic, plus accepted_values for country.
Tests for `dim_customers` created:

**Schema tests** (`models/marts/_marts.yml`):
- `customer_id`: unique, not_null
- `first_name`, `last_name`: not_null
- `country`: not_null, accepted_values (US, CA, UK, AU, DE, FR)
- `created_at`: not_null
- `most_recent_order_date`: not_null, recency (2 years)
- `first_order_date`: recency (2 years)
- `number_of_orders`: not_null, expression >= 0
- `lifetime_value`: not_null, expression >= 0

**Custom tests** (`tests/`):
- `assert_customers_with_no_orders_have_zero_metrics.sql`: Validates customers with 0 orders have 0 lifetime_value

---
## Generated File: tests/assert_customers_with_no_orders_have_zero_metrics.sql

-- Customers with no orders should have zero orders and zero lifetime value
select customer_id
from {{ ref('dim_customers') }}
where number_of_orders = 0
  and lifetime_value != 0
## Generated File: models/marts/_marts.yml

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
          - accepted_values:
              arguments:
                values: ['US', 'CA', 'UK', 'AU', 'DE', 'FR']
      - name: created_at
        description: Account creation date
        tests:
          - not_null
      - name: first_order_date
        description: Date of first order (null if never ordered)
        tests:
          - dbt_utils.recency:
              arguments:
                datepart: year
                interval: 2
                from: now()
      - name: most_recent_order_date
        description: Date of most recent order
        tests:
          - not_null
          - dbt_utils.recency:
              arguments:
                datepart: year
                interval: 2
                from: now()
      - name: number_of_orders
        description: Total orders placed
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"
      - name: lifetime_value
        description: Total revenue from completed orders in dollars
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"

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
