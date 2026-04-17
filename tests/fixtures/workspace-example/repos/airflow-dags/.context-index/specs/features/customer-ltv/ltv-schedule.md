---
charter: customer-ltv
status: review-passed
revision: 1
created: 2026-04-16
updated: 2026-04-16
depends-on: ["@dbt-models/ltv-model"]
---

# Live Spec: LTV Schedule

## Behavioral Contract

### Behaviors

1. **When** the DAG runs **then** it invokes `dbt run --select customer_ltv` at 02:00 UTC daily.
2. **When** the dbt run fails **then** the task is marked failed and retries up to 2 times.
3. **When** the DAG completes successfully **then** an event is emitted to the observability layer.

## Acceptance Criteria

- [ ] DAG runs daily at 02:00 UTC
- [ ] Failed dbt runs retry up to 2 times
- [ ] Success event is emitted
