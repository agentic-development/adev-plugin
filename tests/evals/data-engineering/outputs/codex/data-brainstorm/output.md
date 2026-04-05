The charter is written at [charter.md](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/customer-lifetime-value/charter.md#L1). It treats `dim_customers.lifetime_value` as the authoritative historical CLV base, explicitly depends on `fct_orders`, `dim_customers`, and `int_customer_order_history`, and positions the module as an extension of the existing marts rather than a rewrite.

The proposed v1 shape is a reusable intermediate layer plus consumer-facing marts: `int_customer_clv_features`, `int_customer_clv_cohorts`, `dim_customer_clv`, and `fct_customer_cohort_periods`, with predictive CLV split into a later phase as `dim_customer_clv_predictions` in [charter.md](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/customer-lifetime-value/charter.md#L77). The charter also defines testable quality attributes around reconciliation, grain, documentation, generic dbt tests, and PII boundaries in [charter.md](/Users/dpavancini/Development/adev:plugin/tests/evals/adev:data-eval/.context-index/specs/features/customer-lifetime-value/charter.md#L109).

I did not run `dbt` checks because this turn only created the charter document. If you want, the next step is to turn this into one or more Live Specs with `$adev:specify`.
---

## Generated Files

### `.context-index/specs/features/customer-lifetime-value/charter.md`

```
---
status: draft
revision: 1
updated: 2026-03-31
---

# Feature Charter: customer-lifetime-value

<!-- Feature Charter for the customer-lifetime-value module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

<!-- # tracker-ref: -->

## Business Intent

The customer-lifetime-value module standardizes customer value analytics as production dbt models built on top of the existing customer and order marts. It extends the current historical `dim_customers.lifetime_value` capability with reusable cohort, segmentation, and predictive CLV outputs so analysts can compare customer value over time without duplicating business logic.

## Scope and Boundaries

### In Scope

- Define reusable CLV feature logic that builds from `fct_orders`, `dim_customers`, and `int_customer_order_history`
- Publish a customer-grain CLV mart that preserves the existing historical lifetime value as the authoritative completed-order revenue metric
- Publish cohort-grain outputs for acquisition cohort, cohort age, retention, and revenue progression
- Publish segmentation outputs derived from shared CLV features such as recency, frequency, monetary value, tenure, and average order value
- Define a phased predictive CLV capability that estimates expected future value using only existing customer and order data in dbt
- Require model-level documentation and dbt tests for all new CLV models

### Out of Scope

- Replacing or redefining `dim_customers.lifetime_value`
- Duplicating customer order history logic already owned by `int_customer_order_history`
- Real-time scoring, external ML services, or non-dbt serving infrastructure
- Product-level profitability, attribution, or margin analytics
- Ad hoc analysis-only outputs that bypass the marts layer for production consumption

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `dim_customers` | internal module | Existing customer dimension that exposes customer identity, first/most recent order dates, number of orders, and historical `lifetime_value` |
| `fct_orders` | internal module | Existing order fact at order grain with completed-order revenue and payment breakdowns |
| `int_customer_order_history` | internal module | Existing reusable customer aggregation that remains the source of truth for historical order rollups |
| `analyses/customer_cohort_analysis.sql` | internal module | Existing ad hoc cohort logic to be formalized into production-grade models rather than copied as-is |
| dbt + DuckDB platform | external service | Execution environment for SQL/Jinja transformations, tests, docs generation, and scheduled runs |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| CLV Feature Set | Reusable customer-grain feature record derived from existing marts and intermediate history | `customer_id`, `first_order_date`, `most_recent_order_date`, `number_of_orders`, `historical_lifetime_value`, `customer_tenure_days`, `recency_days`, `average_order_value` |
| Customer CLV Profile | Consumer-facing customer-grain mart for CLV reporting and segmentation | `customer_id`, `historical_lifetime_value`, `clv_segment`, `acquisition_cohort_month`, `predicted_lifetime_value`, `prediction_status` |
| Customer Cohort | Acquisition cohort anchored to the customer's first completed order month | `cohort_month`, `customer_id`, `cohort_age_month` |
| Cohort Period Fact | Cohort-period aggregate for retention and revenue progression analysis | `cohort_month`, `cohort_age_month`, `active_customers`, `orders_count`, `period_revenue`, `cumulative_revenue` |
| CLV Segment | Rule-based grouping of customers by shared CLV features | `segment_name`, `recency_band`, `frequency_band`, `monetary_band` |

### Relationships

- Each `Customer CLV Profile` row maps to exactly one customer in `dim_customers`.
- Each customer may have zero or one `CLV Feature Set` row for the current warehouse state.
- Each customer belongs to at most one `Customer Cohort`, derived from the first completed order month.
- Each `Cohort Period Fact` row aggregates many customers for one `cohort_month` and one `cohort_age_month`.
- Each `Customer CLV Profile` may map to one `CLV Segment`, assigned from shared feature thresholds rather than model-specific logic.

### Invariants

- Historical CLV in this module must reconcile to `dim_customers.lifetime_value` for the same `customer_id`.
- No CLV mart may recompute customer order history directly from staging models when the same metric already exists in `int_customer_order_history`.
- Customer-grain outputs must have one row per `customer_id`; cohort-period outputs must have one row per `cohort_month` plus `cohort_age_month`.
- Customers with no completed orders must not be assigned a completed-order cohort and must have zero or null revenue-derived CLV metrics according to the model contract.
- Segmentation thresholds must be defined once in reusable CLV feature logic and consumed consistently by downstream marts.
- Predictive CLV outputs must be explicitly labeled as estimates and kept separate from historical realized lifetime value.

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Shared CLV feature engineering | Build reusable intermediate CLV features from `fct_orders`, `dim_customers`, and `int_customer_order_history` without duplicating existing rollups | must-have | v1 | proposed |
| Customer CLV mart | Publish `dim_customer_clv` as the customer-grain mart for historical CLV, recency/frequency metrics, and analyst-ready customer value attributes | must-have | v1 | proposed |
| Cohort performance mart | Publish `fct_customer_cohort_periods` for cohort retention, period revenue, and cumulative value by acquisition month and cohort age | must-have | v1 | proposed |
| CLV segmentation | Assign customers to reusable value segments such as high-value, growing, at-risk, and low-engagement | should-have | v1 | proposed |
| Predictive CLV mart | Publish a phased predictive CLV output based on SQL-derived heuristics or statistical features computed from existing data | should-have | v2 | proposed |
| CLV documentation and tests | Add schema docs and dbt tests that make grain, metric semantics, and quality rules explicit for every CLV model | must-have | v1 | proposed |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `int_customer_clv_features` | dbt model | Reusable intermediate customer-grain feature model for CLV calculations and segmentation |
| `int_customer_clv_cohorts` | dbt model | Reusable intermediate model assigning acquisition cohort and cohort age attributes |
| `dim_customer_clv` | dbt model | Consumer-facing customer dimension extension for CLV reporting, segmentation, and optional predictive fields |
| `fct_customer_cohort_periods` | dbt model | Consumer-facing cohort-period fact for retention and revenue trend analysis |
| `dim_customer_clv_predictions` | dbt model | Phase-2 consumer-facing predictive CLV output kept separate from historical realized metrics |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `dim_customers` | marts | Supplies authoritative customer dimension fields, including historical `lifetime_value` and order date anchors |
| `fct_orders` | marts | Supplies order-grain revenue and order status needed for cohort and CLV feature calculations |
| `int_customer_order_history` | intermediate | Supplies reusable historical order aggregates to avoid duplicate logic |
| `customer_cohort_analysis` | analyses | Supplies a reference pattern for cohort questions that should be migrated into production-grade marts |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | CLV marts must depend on existing marts and intermediate models rather than rejoining raw seeds directly; the full CLV selector must pass `dbt compile` and fit within the project's normal daily dbt run on DuckDB. |
| Availability | All CLV outputs are batch dbt models and must be reproducible from a standard project run without external services or manual analyst steps. |
| Security | New CLV marts must expose `customer_id` as the join key and must not replicate unnecessary PII such as customer email into CLV-specific outputs. |
| Observability | Every new CLV model must have documented grain, metric definitions, and at least one generic dbt test; critical metrics need explicit assertions for uniqueness, relationships, and non-negative revenue fields. |
| Correctness | Historical CLV fields must reconcile to `dim_customers.lifetime_value`, cohort counts must reconcile to the underlying customer population, and predictive fields must be labeled separately from realized revenue. |
| Evolvability | Segmentation and predictive logic must consume shared intermediate CLV features so threshold or formula changes occur in one place and propagate consistently. |
```

