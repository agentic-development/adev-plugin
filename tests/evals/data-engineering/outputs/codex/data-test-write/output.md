Added dbt-idiomatic coverage for `dim_customers` in [models/marts/_marts.yml](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/_marts.yml#L42), keeping `email` nullable while adding schema tests for `customer_id` lineage, `country` accepted values, and `not_null` on `created_at`, `number_of_orders`, and `lifetime_value`. I also strengthened the no-order edge-case data test in [tests/assert_customers_with_no_orders_have_zero_metrics.sql](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/tests/assert_customers_with_no_orders_have_zero_metrics.sql#L1) and added [tests/assert_dim_customers_metrics_match_orders.sql](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/tests/assert_dim_customers_metrics_match_orders.sql#L1) plus [tests/assert_dim_customers_lifetime_value_non_negative.sql](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/tests/assert_dim_customers_lifetime_value_non_negative.sql#L1).

To make the no-order case deterministic, I added one seed customer with no orders in [seeds/raw_customers.csv](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/seeds/raw_customers.csv#L51). I could not run `dbt seed` or `dbt test` here because `dbt` is not installed in this environment. Based on the current model in [models/marts/dim_customers.sql](/Users/dpavancini/Development/adev-plugin/tests/evals/adev-data-eval/models/marts/dim_customers.sql#L17), the new tests should currently go red for that seeded customer: `lifetime_value` is coalesced to `0`, but `number_of_orders` is still left as `NULL`.
---

## Generated Files

### `tests/assert_dim_customers_lifetime_value_non_negative.sql`

```
-- Lifetime value should never be negative.
select
    customer_id,
    lifetime_value
from {{ ref('dim_customers') }}
where lifetime_value < 0
```

### `tests/assert_dim_customers_metrics_match_orders.sql`

```
-- Customer lifetime metrics should reconcile to staged order data.
with expected as (
    select
        c.customer_id,
        min(o.order_date) as first_order_date,
        max(o.order_date) as most_recent_order_date,
        count(o.order_id) as number_of_orders,
        coalesce(
            sum(case when o.order_status = 'completed' then o.order_total else 0 end),
            0
        ) as lifetime_value
    from {{ ref('stg_customers') }} as c
    left join {{ ref('stg_orders') }} as o
        on c.customer_id = o.customer_id
    group by 1
)

select
    d.customer_id,
    d.first_order_date,
    e.first_order_date as expected_first_order_date,
    d.most_recent_order_date,
    e.most_recent_order_date as expected_most_recent_order_date,
    d.number_of_orders,
    e.number_of_orders as expected_number_of_orders,
    d.lifetime_value,
    e.lifetime_value as expected_lifetime_value
from {{ ref('dim_customers') }} as d
inner join expected as e
    on d.customer_id = e.customer_id
where d.first_order_date is distinct from e.first_order_date
   or d.most_recent_order_date is distinct from e.most_recent_order_date
   or d.number_of_orders is distinct from e.number_of_orders
   or d.lifetime_value is distinct from e.lifetime_value
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
                values: ['AU', 'BR', 'CA', 'DE', 'FR', 'IN', 'MX', 'UK', 'US']
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
51,Nina,Zero,,2024-12-31,US
```

### `tests/assert_customers_with_no_orders_have_zero_metrics.sql`

```
-- Customers with no orders should have null order dates and zero-valued metrics.
with customers_without_orders as (
    select c.customer_id
    from {{ ref('stg_customers') }} as c
    left join {{ ref('stg_orders') }} as o
        on c.customer_id = o.customer_id
    where o.customer_id is null
)

select
    d.customer_id,
    d.first_order_date,
    d.most_recent_order_date,
    d.number_of_orders,
    d.lifetime_value
from {{ ref('dim_customers') }} as d
inner join customers_without_orders as c
    on d.customer_id = c.customer_id
where d.first_order_date is not null
   or d.most_recent_order_date is not null
   or d.number_of_orders is null
   or d.number_of_orders != 0
   or d.lifetime_value != 0
```

