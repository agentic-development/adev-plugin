# dbt Data Warehouse Architecture

## 1. Project Overview and Stack

**Project Name:** adev_data_eval
**Version:** 1.0.0
**Data Warehouse:** DuckDB
**Orchestration:** Apache Airflow
**Data Quality:** dbt tests + Great Expectations
**dbt Packages:** dbt-labs/dbt_utils >= 1.1.0

Targets: dev (target/dev.duckdb), prod (target/prod.duckdb), both 4 threads.

## 2. Model Inventory

### Staging Layer (4 models, Views)

1. **stg_customers** — Customer master data with standardized column names
2. **stg_orders** — Order data with unit conversion (cents to dollars)
3. **stg_payments** — Payment ledger with amount conversion to dollars
4. **stg_products** — Product catalog with pricing in dollars

### Intermediate Layer (2 models, Tables)

1. **int_orders_pivoted_to_payments** — Order-level payment breakdown pivoted by method
2. **int_customer_order_history** — Customer aggregation with order metrics and lifetime value

### Marts Layer (3 models, Tables)

1. **fct_orders** — Order fact table with payment method breakdown
2. **dim_customers** — Customer dimension with order history and lifetime metrics
3. **dim_products** — Product dimension table with catalog information

## 3. Data Flow Diagram

```
Seeds (raw schema)                 STAGING (views)                INTERMEDIATE (tables)           MARTS (tables)

raw_customers ──────> stg_customers ──────────────────────────────────────────────────> dim_customers
                                                                                          ^
                      stg_orders ──> int_customer_order_history ──────────────────────────┘
                          │
                          ├──────────────────────────────────────────────────────> fct_orders
                          │                                                           ^
raw_orders ───────> stg_orders ──────> snapshot_orders (SCD2)                          │
                                                                                      │
raw_payments ─────> stg_payments ──> int_orders_pivoted_to_payments ──────────────────┘

raw_products ─────> stg_products ──────────────────────────────────────────────> dim_products
```

## 4. Key Transformations

### 4.1 cents_to_dollars Macro
Formula: `round(column_name / 100.0, 2)`
Applied in stg_orders, stg_payments, stg_products to convert integer cent amounts to decimal dollars.

### 4.2 Payment Pivoting (int_orders_pivoted_to_payments)
Conditional aggregation: `SUM(CASE WHEN payment_method = 'X' THEN amount ELSE 0 END)` grouped by order_id.
Produces: credit_card_amount, bank_transfer_amount, gift_card_amount, total_amount per order.

### 4.3 Customer Aggregation (int_customer_order_history)
Per-customer metrics from stg_orders:
- first_order_date — MIN(order_date)
- most_recent_order_date — MAX(order_date)
- number_of_orders — COUNT(order_id)
- lifetime_value — SUM(order_total) WHERE order_status = 'completed' only

### 4.4 Lifetime Value (dim_customers)
LEFT JOIN stg_customers to int_customer_order_history. COALESCE(lifetime_value, 0) ensures customers with no completed orders show $0.

## 5. Model Dependencies (Ref Graph)

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

Build order: Seeds -> Staging (parallel) -> Intermediate (parallel) -> Marts (parallel) -> Snapshots

## 6. Testing Strategy

### 6.1 Total: 50 tests

**Staging:** 28 tests (unique, not_null, relationships, accepted_values across all 4 models)
**Intermediate:** 4 tests (unique, not_null on PKs)
**Marts:** 16 tests (unique, not_null, accepted_values, relationships)

### 6.2 Custom Data Tests
- assert_orders_have_valid_status.sql — validates order_status values
- assert_positive_order_amounts.sql — validates order_total > 0

### 6.3 Great Expectations
- DuckDB datasource configured
- Expectation suites for raw_customers and raw_orders
- Checkpoints: raw_customers_checkpoint, raw_orders_checkpoint

## 7. Orchestration

### DAG 1: dbt_daily_run
Schedule: Daily at 06:00 UTC
Task chain: dbt_seed → dbt_test_sources → dbt_run_staging → dbt_run_intermediate → dbt_run_marts → dbt_test_models → dbt_snapshot
Retries: 2, delay 5 min. Email alerts to data-alerts@example.com.

### DAG 2: data_quality_check
Schedule: Daily at 08:00 UTC (2 hours after dbt run)
Tasks (parallel): validate_raw_customers, validate_raw_orders (Great Expectations checkpoints)
Retries: 1, delay 2 min.

## 8. Entry Points for BI Consumers

| Model | Type | Grain | Use Case |
|---|---|---|---|
| fct_orders | Fact | One row per order | Order analysis, revenue, payment breakdown |
| dim_customers | Dimension | One row per customer | Segmentation, LTV, geographic analysis |
| dim_products | Dimension | One row per product | Catalog reporting, category analysis |

Join pattern: fct_orders JOIN dim_customers ON customer_id

## 9. SCD Type 2 Snapshot

**snapshot_orders** — Tracks order_status changes using check strategy.
- unique_key: order_id
- check_cols: ['order_status']
- target_schema: snapshots

Captures full history of order status transitions (placed → shipped → completed → returned).
Runs as final task in dbt_daily_run DAG.
