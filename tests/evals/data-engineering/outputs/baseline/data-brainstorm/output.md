# Feature Charter: Customer Lifetime Value (CLV) Analytics Module

## 1. Business Intent

The existing data warehouse already tracks a basic `lifetime_value` field on `dim_customers` -- the sum of `order_total` for completed orders. This is a backward-looking revenue total, not a true CLV metric. It tells you what a customer has spent, but not what they are worth going forward, how their spending behavior is trending, or how they compare to peers.

The CLV Analytics Module exists to answer three questions the current models cannot:

- **How much future revenue can we expect from a given customer?** (Predictive CLV)
- **Which customer segments are most and least valuable, and how are they trending?** (Cohort and segment analysis)
- **Where in the customer lifecycle are we losing value?** (Retention and purchase frequency decay)

## 2. Scope and Boundaries

### In Scope

- New intermediate and mart models built on existing staging and intermediate layers (`stg_customers`, `stg_orders`, `stg_payments`, `int_customer_order_history`, `int_orders_pivoted_to_payments`)
- Historical CLV (extends `dim_customers.lifetime_value`, not duplicated)
- Purchase frequency, average order value, and customer lifespan calculations
- Simple probabilistic CLV estimation using BG/NBD-style heuristics in SQL
- Cohort-based analysis by `created_at` month and `country`
- Customer segmentation tiers (high-value, mid-value, low-value, at-risk, churned)
- Schema documentation and dbt tests for all new models

### Out of Scope

- Real-time or streaming CLV computation
- Machine learning model training or serving
- Product-level affinity or recommendation models
- Modifications to existing staging models
- Marketing attribution or channel-level acquisition cost data

## 3. Domain Model

### Entities

| Entity | Source Model | Role in CLV |
|---|---|---|
| Customer | `stg_customers` / `dim_customers` | Subject of CLV measurement |
| Order | `stg_orders` / `fct_orders` | Primary revenue event |
| Payment | `stg_payments` / `int_orders_pivoted_to_payments` | Payment method breakdown |
| Customer Order History | `int_customer_order_history` | Pre-aggregated per-customer summary |

### Domain Invariants

1. CLV is always non-negative
2. Only completed orders count toward realized revenue
3. Customer tenure measured from `created_at`, not `first_order_date`
4. Churn defined by recency relative to configurable threshold
5. All amounts in USD (dollars, not cents)

## 4. Capability Map

### Must-Have (MVP)

| # | Capability | Description |
|---|---|---|
| M1 | Per-customer CLV summary | `fct_customer_clv` with lifetime_value, avg_order_value, purchase_frequency, predicted_clv, clv_segment |
| M2 | CLV segmentation | Assign customers to segments based on RFM thresholds (dbt variables) |
| M3 | Customer purchase intervals | `int_customer_purchase_intervals` computing inter-purchase durations |
| M4 | Schema and tests | Full `_clv.yml` with unique, not_null, accepted_values tests |

### Should-Have (Fast Follow)

| # | Capability | Description |
|---|---|---|
| S1 | Cohort analysis mart | `fct_clv_cohorts` grouping by signup month and country |
| S2 | CLV trend snapshot | Periodic snapshot of CLV metrics per customer |
| S3 | Revenue concentration | Pareto analysis (top 10/20/50% revenue contribution) |

## 5. Interface Contracts

### Models Produced

| Model | Layer | Grain | Primary Key |
|---|---|---|---|
| `int_customer_purchase_intervals` | intermediate | One row per customer per order pair | customer_id, order_sequence_number |
| `fct_customer_clv` | marts | One row per customer | customer_id |
| `fct_clv_cohorts` | marts | One row per cohort-month per retention-month | cohort_month, country, months_since_signup |

### Upstream Dependencies (consumed, not modified)

- `stg_customers`, `stg_orders`, `int_customer_order_history`, `dim_customers`

## 6. Quality Attributes

### Freshness
- Refreshable within a single `dbt run` invocation, no circular dependencies

### Accuracy
- `lifetime_value` must exactly equal `dim_customers.lifetime_value`
- `predicted_clv` labeled as estimated with methodology documented

### Completeness
- Every customer in `stg_customers` must appear in `fct_customer_clv`
- `clv_segment` must be non-null for every row

### Testability
- PK uniqueness, referential integrity, accepted_values on segment
- Value consistency between `fct_customer_clv` and `dim_customers`
- Non-negative amounts on lifetime_value, avg_order_value, predicted_clv
