Here's a summary of what was produced:

## Test Results: PASS 13, FAIL 1 (RED confirmed)

### Schema tests added to `_marts.yml`
| Column | Test | Status |
|--------|------|--------|
| `country` | `accepted_values` (US, UK, CA, MX, AU, DE, FR, IN, BR) | PASS |
| `created_at` | `not_null` | PASS |

### Custom SQL data tests
| Test File | What it validates | Status |
|-----------|-------------------|--------|
| `assert_dim_customers_lifetime_value_non_negative.sql` | `lifetime_value >= 0` for all customers | PASS |
| `assert_dim_customers_order_dates_consistent.sql` | `first_order_date <= most_recent_order_date` | PASS |
| `assert_dim_customers_complete_customer_coverage.sql` | Every `stg_customers` row appears in `dim_customers` (left join completeness) | PASS |
| `assert_dim_customers_lifetime_value_completed_only.sql` | Customer 1's lifetime_value = 292.93 (only completed orders, deterministic seed assertion) | PASS |
| `assert_dim_customers_no_orders_defaults.sql` | Customers with no orders have `lifetime_value = 0`; customers with orders don't have NULL metrics | PASS |
| `assert_dim_customers_number_of_orders_coalesced.sql` | `number_of_orders` should not be NULL (RED) | **FAIL** |

### RED state defect found
The model coalesces `lifetime_value` to 0 but leaves `number_of_orders` as NULL for customers without orders. The fix would be adding `coalesce(order_history.number_of_orders, 0)` in `dim_customers.sql` line 19.

### Seed data change
Added customer 51 (Zara Novak, no email, no orders) to `raw_customers.csv` to exercise the no-orders edge case that the original 50 customers didn't cover.

---

## Generated Files

### `tests/assert_dim_customers_complete_customer_coverage.sql`

```
-- Every customer in stg_customers must appear in dim_customers.
-- The model uses a left join, so no customer should be dropped.
-- Returns any stg_customers rows missing from dim_customers.
select
    stg.customer_id
from {{ ref('stg_customers') }} as stg
left join {{ ref('dim_customers') }} as dim
    on stg.customer_id = dim.customer_id
where dim.customer_id is null
```

### `tests/assert_dim_customers_lifetime_value_completed_only.sql`

```
-- Validates that lifetime_value only sums completed orders.
-- Customer 1 (Alice Johnson) has these orders in the seed data:
--   order 1:  completed, 59.98
--   order 2:  completed, 89.99
--   order 6:  completed, 12.99
--   order 21: completed, 19.99
--   order 53: placed,    39.99  (should be EXCLUDED)
--   order 90: completed, 49.99
--   order 123: completed, 59.99
-- Expected lifetime_value = 59.98 + 89.99 + 12.99 + 19.99 + 49.99 + 59.99 = 292.93
--
-- Returns a row if the value does not match, proving the model
-- correctly excludes non-completed orders.
select
    customer_id,
    lifetime_value,
    292.93 as expected_lifetime_value
from {{ ref('dim_customers') }}
where customer_id = 1
  and abs(lifetime_value - 292.93) > 0.01
```

### `tests/assert_dim_customers_lifetime_value_non_negative.sql`

```
-- Every customer must have a non-negative lifetime_value.
-- The model coalesces NULL to 0 via the left join, so no customer
-- should ever have lifetime_value < 0.
select
    customer_id,
    lifetime_value
from {{ ref('dim_customers') }}
where lifetime_value < 0
```

### `tests/assert_dim_customers_no_orders_defaults.sql`

```
-- Customers with no orders should have:
--   lifetime_value = 0 (coalesced from NULL)
--   first_order_date IS NULL
--   most_recent_order_date IS NULL
--   number_of_orders IS NULL (not coalesced in the model)
--
-- This test identifies customers whose order metrics from the left join
-- are NULL (no match in int_customer_order_history) but whose
-- lifetime_value was NOT correctly defaulted to 0.
--
-- Additionally checks that number_of_orders is consistently NULL
-- when first_order_date is NULL (i.e., no partial data from the join).
select
    customer_id,
    first_order_date,
    most_recent_order_date,
    number_of_orders,
    lifetime_value
from {{ ref('dim_customers') }}
where first_order_date is null
  and (lifetime_value != 0 or lifetime_value is null)

union all

-- Inverse: customers with orders should NOT have zero lifetime_value
-- unless all their orders are non-completed (placed/shipped/returned).
-- This catches the case where the join silently drops order history.
select
    customer_id,
    first_order_date,
    most_recent_order_date,
    number_of_orders,
    lifetime_value
from {{ ref('dim_customers') }}
where first_order_date is not null
  and number_of_orders is null
```

### `tests/assert_dim_customers_number_of_orders_coalesced.sql`

```
-- Customers with no orders should have number_of_orders = 0, not NULL.
-- Customer 51 (Zara Novak) has no orders in the seed data.
-- The model currently does NOT coalesce number_of_orders, so this test
-- should FAIL (RED) until the model is fixed to add:
--   coalesce(order_history.number_of_orders, 0) as number_of_orders
select
    customer_id,
    number_of_orders
from {{ ref('dim_customers') }}
where number_of_orders is null
```

### `tests/assert_dim_customers_order_dates_consistent.sql`

```
-- For every customer who has ordered, first_order_date must be
-- on or before most_recent_order_date.
select
    customer_id,
    first_order_date,
    most_recent_order_date
from {{ ref('dim_customers') }}
where first_order_date is not null
  and most_recent_order_date is not null
  and first_order_date > most_recent_order_date
```

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

### `seeds/raw_customers.csv`

```
id,first_name,last_name,email,created_at,country
1,Alice,Johnson,alice.johnson@example.com,2024-01-15,US
2,Bob,Smith,bob.smith@example.com,2024-01-20,US
3,Carol,Williams,carol.williams@example.com,2024-02-01,UK
4,David,Brown,,2024-02-10,CA
5,Eva,Martinez,eva.martinez@example.com,2024-02-14,MX
6,Frank,Davis,frank.davis@example.com,2024-02-28,US
7,Grace,Wilson,grace.wilson@example.com,2024-03-05,UK
8,Henry,Taylor,henry.taylor@example.com,2024-03-10,AU
9,Iris,Anderson,,2024-03-15,US
10,Jack,Thomas,jack.thomas@example.com,2024-03-20,CA
11,Karen,Jackson,karen.jackson@example.com,2024-04-01,US
12,Leo,White,leo.white@example.com,2024-04-05,DE
13,Mia,Harris,mia.harris@example.com,2024-04-10,FR
14,Noah,Clark,noah.clark@example.com,2024-04-15,US
15,Olivia,Lewis,olivia.lewis@example.com,2024-04-20,UK
16,Paul,Robinson,paul.robinson@example.com,2024-05-01,US
17,Quinn,Walker,,2024-05-05,CA
18,Rachel,Hall,rachel.hall@example.com,2024-05-10,AU
19,Sam,Allen,sam.allen@example.com,2024-05-15,US
20,Tina,Young,tina.young@example.com,2024-05-20,DE
21,Uma,King,uma.king@example.com,2024-06-01,IN
22,Victor,Wright,victor.wright@example.com,2024-06-05,US
23,Wendy,Lopez,wendy.lopez@example.com,2024-06-10,MX
24,Xavier,Hill,xavier.hill@example.com,2024-06-15,US
25,Yara,Scott,yara.scott@example.com,2024-06-20,BR
26,Zach,Green,zach.green@example.com,2024-07-01,US
27,Amy,Adams,amy.adams@example.com,2024-07-05,UK
28,Ben,Baker,ben.baker@example.com,2024-07-10,US
29,Chloe,Carter,chloe.carter@example.com,2024-07-15,FR
30,Dan,Cooper,dan.cooper@example.com,2024-07-20,US
31,Ella,Cruz,ella.cruz@example.com,2024-08-01,MX
32,Finn,Diaz,finn.diaz@example.com,2024-08-05,US
33,Gina,Evans,gina.evans@example.com,2024-08-10,UK
34,Hugo,Fisher,,2024-08-15,DE
35,Ivy,Garcia,ivy.garcia@example.com,2024-08-20,US
36,Jake,Grant,jake.grant@example.com,2024-09-01,CA
37,Kate,Howard,kate.howard@example.com,2024-09-05,AU
38,Liam,James,liam.james@example.com,2024-09-10,US
39,Maya,Kelly,maya.kelly@example.com,2024-09-15,IN
40,Nick,Lee,nick.lee@example.com,2024-09-20,US
41,Olga,Mitchell,olga.mitchell@example.com,2024-10-01,US
42,Pete,Nelson,pete.nelson@example.com,2024-10-05,UK
43,Rose,Ortiz,rose.ortiz@example.com,2024-10-10,MX
44,Sean,Parker,sean.parker@example.com,2024-10-15,US
45,Tara,Quinn,tara.quinn@example.com,2024-10-20,CA
46,Uri,Reed,uri.reed@example.com,2024-11-01,US
47,Val,Stone,val.stone@example.com,2024-11-05,AU
48,Will,Turner,will.turner@example.com,2024-11-10,US
49,Xena,Vargas,xena.vargas@example.com,2024-11-15,BR
50,Yuri,Webb,yuri.webb@example.com,2024-11-20,US
51,Zara,Novak,,2024-12-01,US
```

