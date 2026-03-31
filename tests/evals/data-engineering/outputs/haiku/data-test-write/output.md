# Data Quality Test Specification for dim_customers

## 1. YAML Schema Tests (for _marts.yml)

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
        tests:
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: email
              config:
                where: "email is not null"

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

      - name: number_of_orders
        description: Total orders placed
        tests:
          - not_null

      - name: lifetime_value
        description: Total revenue from completed orders in dollars
        tests:
          - not_null
```

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

### `tests/assert_dim_customers_order_dates_logical_sequence.sql`

```sql
-- first_order_date should be <= most_recent_order_date
select
    customer_id,
    first_order_date,
    most_recent_order_date
from {{ ref('dim_customers') }}
where first_order_date is not null
  and most_recent_order_date is not null
  and first_order_date > most_recent_order_date
```

### `tests/assert_dim_customers_zero_value_has_no_orders.sql`

```sql
-- Customers with lifetime_value = 0 should have no completed orders
select
    customer_id,
    number_of_orders,
    lifetime_value
from {{ ref('dim_customers') }}
where lifetime_value = 0
  and number_of_orders > 0
```

### `tests/assert_dim_customers_known_nulls_in_email.sql`

Deterministic seed-based test. Customers 4, 9, 17, 34 have NULL emails in raw_customers.csv.

```sql
-- Only known customers should have NULL emails
select
    customer_id,
    email
from {{ ref('dim_customers') }}
where email is null
  and customer_id not in (4, 9, 17, 34)
```

### `tests/assert_dim_customers_specific_customer_alice_johnson.sql`

```sql
-- Deterministic assertion for known customer: Alice Johnson
select
    customer_id,
    first_name,
    last_name,
    email,
    country
from {{ ref('dim_customers') }}
where customer_id = 1
  and (
    first_name != 'Alice'
    or last_name != 'Johnson'
    or email != 'alice.johnson@example.com'
    or country != 'US'
  )
```

### `tests/assert_dim_customers_specific_customer_david_brown_null_email.sql`

```sql
-- David Brown (customer_id=4) should have NULL email as per seed
select
    customer_id,
    first_name,
    email
from {{ ref('dim_customers') }}
where customer_id = 4
  and (
    first_name != 'David'
    or email is not null
    or country != 'CA'
  )
```

### `tests/assert_dim_customers_all_seed_customers_present.sql`

```sql
-- All 50 seed customers should be present in the mart
select
    customer_id
from {{ ref('raw_customers') }}
where id not in (
    select customer_id from {{ ref('dim_customers') }}
)
```

### `tests/assert_dim_customers_no_duplicate_customers.sql`

```sql
-- Each customer should appear exactly once
select
    customer_id,
    count(*) as row_count
from {{ ref('dim_customers') }}
group by customer_id
having count(*) > 1
```

### `tests/assert_dim_customers_account_creation_before_first_order.sql`

```sql
-- Account created_at should be <= first order date
select
    customer_id,
    created_at,
    first_order_date
from {{ ref('dim_customers') }}
where created_at is not null
  and first_order_date is not null
  and created_at > first_order_date
```

### `tests/assert_dim_customers_valid_country_codes.sql`

```sql
-- Country codes must be 2-character uppercase alpha codes
select
    customer_id,
    country
from {{ ref('dim_customers') }}
where country not in ('US', 'UK', 'CA', 'MX', 'AU', 'DE', 'FR', 'IN', 'BR')
   or length(country) != 2
   or country != upper(country)
```

---

## Summary

| Category | Test Count | Tests |
|----------|-----------|--------|
| Primary Key | 2 | Unique (YAML), No Duplicates (SQL) |
| Not Null Constraints | 3 | first_name, last_name, number_of_orders (YAML) |
| Relationships | 1 | Email relationships (YAML) |
| Accepted Values | 1 | Country codes (YAML + custom SQL) |
| Custom Business Logic | 4 | LTV non-negative, zero-value logic, date sequences, account-before-order |
| Deterministic Seed Tests | 3 | Alice Johnson, David Brown (NULL email), All 50 customers present |
| Edge Cases | 1 | Null emails (known set) |

Total: 15 tests (7 YAML + 8 custom SQL)

All tests use {{ ref() }} syntax and reference specific customer IDs from deterministic seed data.
