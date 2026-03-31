# Feature Charter: Customer Lifetime Value (CLV) Analytics Module

## 1. Business Intent

The CLV Analytics Module enables organizations to measure, track, and analyze customer economic value over their entire lifecycle. The existing dim_customers.lifetime_value is a backward-looking revenue total — it tells what a customer has spent but not future value, spending trends, or peer comparison.

This module answers: How much future revenue can we expect? Which segments are most valuable? Where in the lifecycle are we losing value?

Builds on existing int_customer_order_history and fct_orders models.

## 2. Scope and Boundaries

### In Scope
- New intermediate and mart models built on existing staging and intermediate layers (stg_customers, stg_orders, stg_payments, int_customer_order_history, int_orders_pivoted_to_payments)
- Historical CLV extending dim_customers.lifetime_value
- Purchase frequency, average order value, customer lifespan calculations
- SQL-based probabilistic CLV estimation (BG/NBD heuristics)
- Cohort analysis by created_at month and country
- Customer segmentation tiers (high_value, mid_value, low_value, at_risk, churned)
- Schema documentation and dbt tests for all new models

### Out of Scope
- **Staging models are NOT modified** — stg_customers, stg_orders, stg_payments, stg_products remain unchanged
- ML model training or serving
- Product-level affinity or recommendation models
- Real-time CLV computation
- Marketing attribution or acquisition cost data

## 3. Domain Model

### Entities

| Entity | Source Model | Role in CLV |
|---|---|---|
| Customer | stg_customers / dim_customers | Subject of CLV measurement |
| Order | stg_orders / fct_orders | Primary revenue event |
| Payment | stg_payments / int_orders_pivoted_to_payments | Payment method breakdown |
| Customer Order History | int_customer_order_history | Pre-aggregated customer summary |

### Domain Invariants

1. CLV is always non-negative. Customers with no completed orders have CLV = 0
2. Only completed orders count toward realized revenue (placed/shipped/returned excluded)
3. Customer tenure measured from created_at, not first_order_date
4. Churn defined by recency vs configurable threshold, no explicit status flag
5. All amounts in USD dollars

## 4. Capability Map

### Must-Have (MVP)

| # | Capability | Proposed Model | Grain |
|---|---|---|---|
| M1 | Per-customer CLV summary | fct_customer_clv | One row per customer (customer_id) |
| M2 | CLV segmentation | (within fct_customer_clv) | customer_id |
| M3 | Customer purchase intervals | int_customer_purchase_intervals | One row per customer per order pair |
| M4 | Schema and tests | _clv.yml | N/A |

### Should-Have

| # | Capability | Proposed Model | Grain |
|---|---|---|---|
| S1 | Cohort analysis mart | fct_clv_cohorts | cohort_month, country, months_since_signup |
| S2 | CLV trend snapshot | fct_clv_snapshots | customer_id, snapshot_date |
| S3 | Revenue concentration | (analysis query) | N/A |

## 5. Interface Contracts

### Models Produced

| Model | Layer | Materialization | Grain |
|---|---|---|---|
| int_customer_purchase_intervals | intermediate | table | customer_id, order_sequence_number |
| fct_customer_clv | marts | table | customer_id |
| fct_clv_cohorts | marts | table | cohort_month, country, months_since_signup |

### Upstream Dependencies (consumed, not modified)
- stg_customers, stg_orders, int_customer_order_history, dim_customers

## 6. Quality Attributes

### Freshness
- Refreshable within a single dbt run, no circular dependencies

### Accuracy
- lifetime_value must equal dim_customers.lifetime_value for every customer
- predicted_clv labeled as estimated with methodology documented

### Completeness
- Every customer in stg_customers appears in fct_customer_clv (including zero-order customers)
- clv_segment is non-null for every row

### Testability
- PK uniqueness and not_null on customer_id
- Referential integrity to dim_customers
- accepted_values on clv_segment: high_value, mid_value, low_value, at_risk, churned, new
- Non-negative: lifetime_value >= 0, avg_order_value >= 0, predicted_clv >= 0
