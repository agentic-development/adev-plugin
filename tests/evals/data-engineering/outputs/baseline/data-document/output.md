# Architecture Documentation -- adev_data_eval

## 1. Project Overview

**Project:** `adev_data_eval` v1.0.0
**Domain:** E-commerce (customers, orders, products, payments)

| Component | Technology |
|---|---|
| Transformation | dbt-core + dbt-duckdb |
| Database | DuckDB (local, zero-dependency) |
| Orchestration | Apache Airflow |
| Data Quality | Great Expectations + dbt tests |
| dbt Packages | dbt-labs/dbt_utils >= 1.1.0 |

**Targets:** dev (`target/dev.duckdb`), prod (`target/prod.duckdb`), both 4 threads.

---

## 2. Model Inventory by Layer

### Seeds (raw schema)

| Seed | Description | Row count |
|---|---|---|
| `raw_customers.csv` | Customer master data | 50 |
| `raw_orders.csv` | Order records | 125 |
| `raw_payments.csv` | Payment transactions | 133 |
| `raw_products.csv` | Product catalog | 20 |

### Staging (views, staging schema)

| Model | Source | Key transformation |
|---|---|---|
| `stg_customers` | `raw_customers` | Rename id -> customer_id, cast created_at to date |
| `stg_orders` | `raw_orders` | Rename id -> order_id, status -> order_status, cents_to_dollars on total_amount_cents |
| `stg_payments` | `raw_payments` | Rename id -> payment_id, cents_to_dollars on amount_cents |
| `stg_products` | `raw_products` | Rename id -> product_id, name -> product_name, cents_to_dollars on price_cents |

### Intermediate (tables, intermediate schema)

| Model | Upstream | Description |
|---|---|---|
| `int_customer_order_history` | `stg_orders` | Per-customer aggregation: first/last order date, order count, lifetime value (completed orders only) |
| `int_orders_pivoted_to_payments` | `stg_payments` | Pivot payment methods into columns per order: credit_card, bank_transfer, gift_card amounts + total |

### Marts (tables, marts schema)

| Model | Upstream | Grain | Description |
|---|---|---|---|
| `fct_orders` | `stg_orders` + `int_orders_pivoted_to_payments` | One row per order | Order fact with payment breakdown by method |
| `dim_customers` | `stg_customers` + `int_customer_order_history` | One row per customer | Customer dimension with lifetime metrics |
| `dim_products` | `stg_products` | One row per product | Product dimension with catalog info |

### Snapshots

| Snapshot | Source | Strategy | Tracked |
|---|---|---|---|
| `snapshot_orders` | `stg_orders` | check | `order_status` |

SCD Type 2 history tracking on order status changes.

---

## 3. Data Flow Diagram

```
SEEDS                    STAGING                INTERMEDIATE                MARTS
=====                    =======                ============                =====

raw_customers ──> stg_customers ────────────────────────────────────> dim_customers
                                                                         ^
                  stg_orders ──> int_customer_order_history ──────────────┘
                      │
                      ├──────────────────────────────────────────> fct_orders
                      │                                               ^
                      └──────────> snapshot_orders (SCD2)              │
                                                                      │
raw_payments ──> stg_payments ──> int_orders_pivoted_to_payments ─────┘

raw_products ──> stg_products ──────────────────────────────────> dim_products
```

---

## 4. Key Transformations

### cents_to_dollars (macro)
`round(column / 100.0, 2)` — applied in stg_orders, stg_payments, stg_products to convert integer cents to decimal dollars.

### Payment pivoting (int_orders_pivoted_to_payments)
Conditional `SUM(CASE WHEN payment_method = 'X' THEN amount ELSE 0 END)` grouped by order_id. Produces one row per order with separate columns for each payment method.

### Customer order history aggregation (int_customer_order_history)
`MIN/MAX(order_date)`, `COUNT(order_id)`, `SUM(order_total) WHERE order_status = 'completed'` grouped by customer_id. Only completed orders contribute to lifetime_value.

### Lifetime value join (dim_customers)
LEFT JOIN stg_customers to int_customer_order_history. `COALESCE(lifetime_value, 0)` ensures customers with no completed orders show $0.

---

## 5. Dependencies (ref graph)

```
raw_customers -> stg_customers -> dim_customers
                                     ^
raw_orders -> stg_orders -> int_customer_order_history
                 |
                 +-> fct_orders
                 |       ^
                 +-> snapshot_orders
                         |
raw_payments -> stg_payments -> int_orders_pivoted_to_payments -> fct_orders

raw_products -> stg_products -> dim_products
```

**Build order:** Seeds -> Staging (parallel) -> Intermediate (parallel) -> Marts (parallel) -> Snapshots

---

## 6. Testing Strategy

### Schema tests (50 total across all layers)
- **unique** on all primary keys
- **not_null** on PKs and required columns
- **accepted_values** on order_status (placed/shipped/completed/returned), payment_method, product category
- **relationships** enforcing FK integrity (orders -> customers, payments -> orders, fct_orders -> dim_customers)

### Custom data tests (2 files in tests/)
- `assert_positive_order_amounts.sql` — order_total > 0
- `assert_orders_have_valid_status.sql` — order_status in recognized set

### Great Expectations
- Expectation suites for raw_customers and raw_orders
- Checks: not_null, uniqueness, value ranges, set membership, row count bounds
- Airflow DAG runs GE checkpoints daily at 08:00

---

## 7. Orchestration

### dbt_daily_run (06:00 UTC daily)
`seed -> test_sources -> run_staging -> run_intermediate -> run_marts -> test_models -> snapshot`

### data_quality_check (08:00 UTC daily)
Runs Great Expectations checkpoints for raw_customers and raw_orders in parallel.

---

## 8. Entry Points for Consumers

| Model | Use case |
|---|---|
| `fct_orders` | Order analysis, revenue reporting, payment method breakdown |
| `dim_customers` | Customer segmentation, LTV analysis, geographic analysis |
| `dim_products` | Product catalog reporting, category analysis |
| `snapshot_orders` | Order lifecycle tracking, fulfillment latency |
| `analyses/customer_cohort_analysis.sql` | Monthly cohort retention and revenue |
| `analyses/revenue_by_product.sql` | Category-level pricing summary |
