The architecture documentation has been generated at `docs/architecture.md`. Here's what it covers:

**Structure:**
- **Data Flow diagram** -- visual ASCII representation showing seeds -> staging -> intermediate -> marts
- **Layer Details** -- every model documented with its source, grain, columns, and transformations
- **Key Transformations** -- `cents_to_dollars` macro, payment pivoting, customer aggregation, null coalescing
- **Snapshots** -- SCD Type 2 configuration for order status tracking
- **Testing Strategy** -- all three tiers: dbt schema tests (unique, not_null, accepted_values, relationships), custom SQL assertion tests, and Great Expectations suites
- **Orchestration** -- both Airflow DAGs with their schedules, task dependencies, and retry configs
- **Materializations Summary** -- table showing view vs table choices per layer

The doc uses dbt terminology throughout (refs, materializations, seeds, sources, schema tests) and is structured for onboarding -- a new team member can read it top-to-bottom to understand the full pipeline from raw CSVs to analytics-ready marts.

---

## Generated Files

### `docs/architecture.md`

```
# Architecture Documentation

## Overview

This is an e-commerce data warehouse built with **dbt** and **DuckDB**, following a three-layer medallion architecture. Raw CSV seeds flow through staging views, intermediate aggregation tables, and into business-facing mart tables. The pipeline is orchestrated by Apache Airflow and validated by both dbt-native tests and Great Expectations suites.

---

## Data Flow

```
                          SEEDS (raw schema)
                   ┌──────────┬──────────┬──────────┐
                   │          │          │          │
             raw_customers  raw_orders  raw_products  raw_payments
                   │          │          │          │
                   ▼          ▼          ▼          ▼
                       STAGING (views, staging schema)
                   ┌──────────┬──────────┬──────────┐
                   │          │          │          │
             stg_customers  stg_orders  stg_products  stg_payments
                   │          │     │         │          │
                   │          │     │         │          │
                   ▼          │     │         │          ▼
              INTERMEDIATE (tables, intermediate schema)
          ┌────────────────┐  │     │    ┌──────────────────────────┐
          │ int_customer_  │  │     │    │ int_orders_pivoted_to_   │
          │ order_history  │  │     │    │ payments                 │
          └───────┬────────┘  │     │    └────────────┬─────────────┘
                  │           │     │                 │
                  ▼           ▼     ▼                 ▼
                          MARTS (tables, marts schema)
                   ┌──────────┬──────────┬──────────┐
                   │          │          │          │
             dim_customers  fct_orders  dim_products
```

---

## Layer Details

### Seeds (Raw Layer)

Seeds are CSV files loaded into the `raw` schema via `dbt seed`. They represent the raw source data with no transformations applied.

| Seed | Rows | Key Columns | Notes |
|------|------|-------------|-------|
| `raw_customers` | 50 | id, first_name, last_name, email, country, created_at | 9 countries; email is nullable |
| `raw_orders` | 125 | id, customer_id, order_date, status, total_amount_cents | Statuses: placed, shipped, completed, returned |
| `raw_products` | 20 | id, name, category, price_cents, created_at | Categories: electronics, accessories, stationery |
| `raw_payments` | 133 | id, order_id, payment_method, amount_cents, created_at | Methods: credit_card, bank_transfer, gift_card |

Monetary values are stored in **cents** at the raw layer.

### Staging Layer

Materialized as **views** in the `staging` schema. Each staging model maps 1:1 to a seed and applies:

- **Column renaming** -- `id` becomes a domain-qualified key (e.g., `customer_id`, `order_id`)
- **Type casting** -- `created_at` strings cast to `date`
- **Unit conversion** -- cents converted to dollars via the `cents_to_dollars` macro: `round(column / 100.0, 2)`

| Model | Source | Key Transformation |
|-------|--------|--------------------|
| `stg_customers` | `raw_customers` | `id` -> `customer_id`, cast `created_at` to date |
| `stg_orders` | `raw_orders` | `id` -> `order_id`, `status` -> `order_status`, cents to dollars |
| `stg_products` | `raw_products` | `id` -> `product_id`, `name` -> `product_name`, cents to dollars |
| `stg_payments` | `raw_payments` | `id` -> `payment_id`, cents to dollars |

All staging models use `{{ ref('seed_name') }}` to reference their source seed.

### Intermediate Layer

Materialized as **tables** in the `intermediate` schema. These models apply business logic that doesn't belong in staging (too complex) or marts (reusable across multiple marts).

#### `int_orders_pivoted_to_payments`

Pivots the `stg_payments` table from one-row-per-payment to one-row-per-order, with separate columns for each payment method:

```
Input (stg_payments):                Output:
order_id | method      | amount      order_id | credit_card | bank_transfer | gift_card | total
1        | credit_card | 50.00  -->  1        | 50.00       | 25.00         | 0.00      | 75.00
1        | bank_transfer| 25.00
```

Columns: `order_id`, `credit_card_amount`, `bank_transfer_amount`, `gift_card_amount`, `total_amount`

#### `int_customer_order_history`

Aggregates `stg_orders` to one-row-per-customer with order history metrics:

- `first_order_date` -- earliest order
- `most_recent_order_date` -- latest order
- `number_of_orders` -- total count
- `lifetime_value` -- sum of `order_total` for **completed orders only**

### Marts Layer

Materialized as **tables** in the `marts` schema. These are the business-facing, analytics-ready models following dimensional modeling conventions.

#### `fct_orders` (Fact Table)

Grain: **one row per order**

Joins `stg_orders` with `int_orders_pivoted_to_payments` to produce an order fact table with payment breakdowns by method. Columns: `order_id`, `customer_id`, `order_date`, `order_status`, `credit_card_amount`, `bank_transfer_amount`, `gift_card_amount`, `total_amount`.

#### `dim_customers` (Dimension Table)

Grain: **one row per customer**

Joins `stg_customers` with `int_customer_order_history` to enrich customer attributes with behavioral metrics. Uses `coalesce(lifetime_value, 0)` for customers with no orders. Columns include profile data (name, email, country) and order metrics (first/last order dates, order count, lifetime value).

#### `dim_products` (Dimension Table)

Grain: **one row per product**

Direct pass-through from `stg_products`. No joins needed since the seed data has no order-line-item granularity. Columns: `product_id`, `product_name`, `category`, `price`, `created_at`.

---

## Key Transformations

| Transformation | Macro/Logic | Used In |
|----------------|-------------|---------|
| Cents to dollars | `{{ cents_to_dollars('column') }}` -> `round(column / 100.0, 2)` | stg_orders, stg_products, stg_payments |
| Payment pivoting | Conditional SUM + GROUP BY on payment_method | int_orders_pivoted_to_payments |
| Customer aggregation | MIN/MAX dates, COUNT orders, SUM completed orders | int_customer_order_history |
| Null coalescing | `coalesce(lifetime_value, 0)` for customers without orders | dim_customers |

---

## Snapshots

### `snapshot_orders`

- **Strategy:** SCD Type 2 (`check` strategy)
- **Source:** `stg_orders`
- **Unique key:** `order_id`
- **Tracked columns:** `order_status`
- **Target schema:** `snapshots`

Captures the full history of order status transitions (e.g., placed -> shipped -> completed -> returned), adding `dbt_valid_from` and `dbt_valid_to` columns for point-in-time queries.

---

## Testing Strategy

### dbt Schema Tests (defined in `_staging.yml`, `_intermediate.yml`, `_marts.yml`)

| Test Type | Count | Applied To |
|-----------|-------|------------|
| `unique` | 9 | All primary keys across all layers |
| `not_null` | 15+ | Primary keys, required business fields |
| `accepted_values` | 4 | order_status, payment_method, category |
| `relationships` (FK) | 4 | customer_id, order_id cross-model references |

Every model has at minimum `unique` + `not_null` tests on its primary key.

### Custom Data Tests (`tests/`)

| Test | Validates |
|------|-----------|
| `assert_orders_have_valid_status` | No orders exist with a status outside the accepted set |
| `assert_positive_order_amounts` | All order totals are strictly positive |

These are SQL assertion tests -- they return rows that violate the condition. An empty result set means the test passes.

### Great Expectations (external validation)

Two expectation suites run against the raw DuckDB tables:

- **`raw_customers_suite`** -- not_null/unique on id, not_null on names, country values in expected set, row count between 1-10,000
- **`raw_orders_suite`** -- not_null/unique on id, valid statuses, amount_cents between 1-10,000,000, row count between 1-100,000

GE connects directly to DuckDB via `SqlAlchemyExecutionEngine` and runs independently of dbt.

---

## Orchestration

### Airflow DAG: `dbt_daily_run`

**Schedule:** Daily at 6:00 AM UTC

```
dbt_seed
   │
   ▼
dbt_test_sources
   │
   ▼
dbt_run_staging
   │
   ▼
dbt_run_intermediate
   │
   ▼
dbt_run_marts
   │
   ├──────────────┐
   ▼              ▼
dbt_test_models  dbt_snapshot
```

Each step runs the appropriate `dbt` command (`dbt seed`, `dbt test --select source:*`, `dbt run --select staging`, etc.). Tests and snapshots run in parallel after marts complete. Configured with 2 retries and 5-minute retry delay.

### Airflow DAG: `data_quality_check`

**Schedule:** Daily at 8:00 AM UTC (2 hours after dbt run)

Runs Great Expectations checkpoints for `raw_customers` and `raw_orders` in parallel. Configured with 1 retry and 2-minute retry delay. Both DAGs send email alerts on failure.

---

## Materializations Summary

| Layer | Materialization | Schema | Model Count |
|-------|----------------|--------|-------------|
| Seeds | table (dbt seed) | `raw` | 4 |
| Staging | view | `staging` | 4 |
| Intermediate | table | `intermediate` | 2 |
| Marts | table | `marts` | 3 |
| Snapshots | snapshot (SCD2) | `snapshots` | 1 |

---

## Analyses

Two ad-hoc analysis queries are available (not materialized):

- **`customer_cohort_analysis`** -- Monthly cohort analysis joining `dim_customers` with `fct_orders` (completed only), showing active customers, total orders, and revenue per signup cohort per month
- **`revenue_by_product`** -- Category-level product pricing summary (count, avg/min/max price)

---

## Dependencies

- **dbt-utils** >= 1.1.0 (locked at 1.3.3) -- provides utility macros
- **DuckDB** -- embedded analytical database, no server required
- **Apache Airflow** -- DAG definitions only (not installed locally)
- **Great Expectations** -- external data validation framework
```

