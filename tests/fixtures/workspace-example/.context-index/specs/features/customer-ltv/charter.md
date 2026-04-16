---
status: approved
revision: 1
updated: 2026-04-16
---

# Feature Charter: Customer LTV

## Business Intent

Expose customer lifetime value (LTV) as a metric consumable by the API and scheduled daily by Airflow. LTV is computed in dbt from order history and customer cohort data. This charter spans three repos: transformation (dbt), serving (API), and orchestration (Airflow).

## Scope and Boundaries

### In Scope

- dbt model computing per-customer LTV from order history
- REST endpoint serving the LTV metric
- Airflow DAG scheduling the dbt model daily

### Out of Scope

- Real-time LTV streaming
- LTV visualization / dashboards

### Dependencies

| Dependency | Direction | Description |
|-----------|-----------|-------------|
| dbt-models | owns | Transformation layer owns the LTV computation |
| data-api | consumes | API consumes the LTV table |
| airflow-dags | orchestrates | Airflow triggers the dbt model |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| CustomerLTV | Lifetime value for a customer | customer_id, ltv_usd, computed_at |

### Invariants

- `ltv_usd >= 0`
- `computed_at` is always UTC

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| LTV Model | dbt model computing per-customer LTV | must-have | 1 | — |
| LTV Endpoint | REST endpoint exposing LTV | must-have | 1 | — |
| LTV Schedule | Daily Airflow DAG triggering the dbt model | must-have | 1 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `customer_ltv` table | SQL view | dbt output table consumed by API |
| `GET /metrics/ltv/:customer_id` | REST endpoint | Returns LTV for a customer |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Order history | dbt-models (upstream) | Source table for LTV calculation |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Freshness | LTV is refreshed daily |
| Accuracy | LTV computation is deterministic given the same inputs |
