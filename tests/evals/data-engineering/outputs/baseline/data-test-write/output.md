# Data Quality Tests for dim_customers

## 1. Schema Tests -- additions to `models/marts/_marts.yml`

```yaml
version: 2

models:
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
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: customer_id
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
                values: ['US', 'UK', 'CA', 'MX', 'AU', 'DE', 'FR', 'IN', 'BR']
      - name: created_at
        description: Account creation date
        tests:
          - not_null
      - name: first_order_date
        description: Date of first order (null if never ordered)
      - name: most_recent_order_date
        description: Date of most recent order
      - name: number_of_orders
        description: Total orders placed
        tests:
          - not_null
      - name: lifetime_value
        description: Total revenue from completed orders in dollars
        tests:
          - not_null
```

**New tests added vs. existing:**
- `customer_id`: added `relationships` to `stg_customers` (FK integrity back to source)
- `country`: added `accepted_values` with the 9 country codes present in seed data
- `created_at`: added `not_null`
- `number_of_orders`: added `not_null`
- `lifetime_value`: added `not_null`

---

## 2. Custom Data Test SQL Files

### `tests/assert_dim_customers_lifetime_value_non_negative.sql`

```sql
-- lifetime_value must be >= 0 for every customer
select
    customer_id,
    lifetime_value
from {{ ref('dim_customers') }}
where lifetime_value < 0
```

### `tests/assert_dim_customers_order_dates_consistent.sql`

```sql
-- first_order_date must not be after most_recent_order_date
select
    customer_id,
    first_order_date,
    most_recent_order_date
from {{ ref('dim_customers') }}
where first_order_date is not null
  and most_recent_order_date is not null
  and first_order_date > most_recent_order_date
```

### `tests/assert_dim_customers_no_orders_implies_null_dates.sql`

```sql
-- Customers with zero orders must have null order dates and zero lifetime value
select
    customer_id,
    number_of_orders,
    first_order_date,
    most_recent_order_date,
    lifetime_value
from {{ ref('dim_customers') }}
where number_of_orders = 0
  and (
    first_order_date is not null
    or most_recent_order_date is not null
    or lifetime_value != 0
  )
```

### `tests/assert_dim_customers_has_orders_implies_dates.sql`

```sql
-- Customers with orders must have populated order dates
select
    customer_id,
    number_of_orders,
    first_order_date,
    most_recent_order_date
from {{ ref('dim_customers') }}
where number_of_orders > 0
  and (
    first_order_date is null
    or most_recent_order_date is null
  )
```

### `tests/assert_dim_customers_expected_null_emails.sql`

Deterministic seed-based test. Customers 4, 9, 17, 34 have NULL emails in raw_customers.csv.

```sql
-- Customers 4, 9, 17, 34 should have null emails; all others should not
select
    customer_id,
    email
from {{ ref('dim_customers') }}
where
    (customer_id in (4, 9, 17, 34) and email is not null)
    or
    (customer_id not in (4, 9, 17, 34) and email is null)
```

### `tests/assert_dim_customers_expected_row_count.sql`

```sql
-- dim_customers must have exactly 50 rows matching the seed
select
    count(*) as row_count
from {{ ref('dim_customers') }}
having count(*) != 50
```

### `tests/assert_dim_customers_lifetime_value_excludes_non_completed.sql`

Deterministic seed-based test. Customer 1 (Alice Johnson) has completed orders totaling 292.93. Order 53 (placed, 39.99) must be excluded.

```sql
-- Alice Johnson (customer_id=1) lifetime_value must exclude non-completed orders
select
    customer_id,
    lifetime_value
from {{ ref('dim_customers') }}
where customer_id = 1
  and round(lifetime_value, 2) != 292.93
```

### `tests/assert_dim_customers_country_code_valid_iso.sql`

```sql
-- All country codes must be 2-character uppercase alpha codes
select
    customer_id,
    country
from {{ ref('dim_customers') }}
where country is null
   or length(country) != 2
   or country != upper(country)
```

---

## Summary

| Test Type | What It Covers |
|---|---|
| Schema: unique | `customer_id` is unique |
| Schema: not_null | customer_id, first_name, last_name, country, created_at, number_of_orders, lifetime_value |
| Schema: accepted_values | country in {US, UK, CA, MX, AU, DE, FR, IN, BR} |
| Schema: relationships | customer_id FK to stg_customers.customer_id |
| Custom: non-negative value | lifetime_value >= 0 |
| Custom: date consistency | first_order_date <= most_recent_order_date |
| Custom: no-order invariants | Zero orders => null dates, zero value |
| Custom: has-order invariants | Positive orders => non-null dates |
| Custom: NULL email edge case | Customers 4, 9, 17, 34 have null emails |
| Custom: row count | Exactly 50 rows from 50-row seed |
| Custom: business logic | Customer 1 lifetime_value = 292.93 (excludes placed orders) |
| Custom: country format | 2-char uppercase alpha codes |
