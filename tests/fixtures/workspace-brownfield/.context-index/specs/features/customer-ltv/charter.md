---
status: approved
revision: 2
updated: 2026-04-16
---

# Feature Charter: Customer LTV (Batch Historical)

## Business Intent

Provide historical customer lifetime value (LTV) as a daily-refreshed metric consumed by ad platform bid optimization. Marketing needs to bid more aggressively on lookalikes of high-LTV customers and pause ad spend on low-LTV cohorts. LTV is computed in the dbt transformation layer, served via the data API, and scheduled daily by Airflow.

## Scope and Boundaries

### In Scope

- dbt model computing per-customer LTV from order history
- REST endpoint serving LTV by customer_id
- Airflow DAG scheduling the dbt model daily at 02:00 UTC
- Schema tests for the LTV table (not_null on customer_id, ltv_usd >= 0)

### Out of Scope

- Real-time LTV (future charter — requires streaming infrastructure)
- Per-channel attribution (future charter — attribution modeling is its own domain)
- Predictive LTV using ML (future charter — requires ML training pipeline)
- LTV segmentation / cohorts (future charter)
- Dashboard / UI (marketing consumes via ad platform API, not a dashboard we build)

### Dependencies

| Dependency | Direction | Description |
|-----------|-----------|-------------|
| dbt-models | owns | Transformation layer owns the LTV computation |
| data-api | consumes | API consumes the `customer_ltv` table |
| airflow-dags | orchestrates | Airflow triggers the dbt model daily |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| CustomerLTV | Historical lifetime value for a customer | customer_id (string), ltv_usd (numeric), computed_at (timestamp UTC) |

### Relationships

- CustomerLTV is computed from the `orders` source table (one row per customer)
- Downstream consumers read CustomerLTV via `GET /metrics/ltv/:customer_id`

### Invariants

- `ltv_usd >= 0`
- `customer_id` is unique (one row per customer in the LTV table)
- `computed_at` is always UTC

## Capability Map

| Capability | Description | Priority | Phase | Target Repo | Status |
|------------|-------------|----------|-------|-------------|--------|
| LTV Model | dbt model computing per-customer LTV with schema tests | must-have | 1 | dbt-models | — |
| LTV Endpoint | REST endpoint serving LTV by customer_id with 404/503 handling | must-have | 1 | data-api | — |
| LTV Schedule | Airflow DAG triggering the dbt model daily with retries and SLA monitoring | must-have | 1 | airflow-dags | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Owner Repo | Description |
|-----------|------|-----------|-------------|
| `customer_ltv` table | SQL table | dbt-models | Owns the schema (columns: customer_id, ltv_usd, computed_at) and the data |
| `GET /metrics/ltv/:customer_id` | REST endpoint | data-api | Reads `customer_ltv`; returns `{ customer_id, ltv_usd, computed_at }` or 404/503 |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `orders` table | dbt-models (upstream source) | Source table for LTV calculation |

### Ownership Rules

- **Schema changes** to `customer_ltv` are owned by `dbt-models`. Any change to column names, types, or primary key requires a spec update in `dbt-models` and propagates to `data-api` via `depends-on`.
- **Endpoint contract** is owned by `data-api`. Response shape, error codes, and auth rules are defined there.
- **Scheduling contract** (cron, retries, SLA) is owned by `airflow-dags`.

## Quality Attributes

| Attribute | Requirement | Owner Repo |
|-----------|-------------|-----------|
| Freshness | LTV is refreshed daily — SLA: table populated by 04:00 UTC | airflow-dags |
| Accuracy | Deterministic — same inputs produce same outputs | dbt-models |
| Availability | API returns 503 when `customer_ltv` is missing or stale (>48h old) | data-api |
| Observability | Airflow DAG emits success/failure events to the oncall channel | airflow-dags |
