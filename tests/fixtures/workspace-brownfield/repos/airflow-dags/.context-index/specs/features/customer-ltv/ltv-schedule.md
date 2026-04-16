---
charter: customer-ltv
status: draft
risk_level: low
revision: 1
charter-revision: 2
milestone: v1
created: 2026-04-16
updated: 2026-04-16
workspace-charter: ../../../../../.context-index/specs/features/customer-ltv/charter.md
depends-on: ["@dbt-models/ltv-model"]
---

# Live Spec: LTV Schedule

## Behavioral Contract

### Preconditions

- Airflow is deployed and has a configured `dbt` operator or BashOperator with dbt access
- The `@dbt-models/ltv-model` exists and is runnable via `dbt run --select customer_ltv`
- An oncall notification channel is configured (Slack/PagerDuty per environment)

### Behaviors

1. **When** Airflow schedules the `customer_ltv` DAG **then** it triggers at 02:00 UTC daily with `catchup=False`.

2. **When** the DAG task runs **then** it executes `dbt run --select customer_ltv` followed by `dbt test --select customer_ltv`.

3. **When** the dbt run fails **then** the task is marked failed and retries up to 2 times with exponential backoff (1 min, 5 min).

4. **When** the DAG completes successfully **then** a success event is emitted to the oncall channel including: DAG id, run timestamp, duration.

5. **When** the DAG fails after all retries **then** a failure event is emitted to the oncall channel including the error message (truncated to 1 KB).

6. **When** the DAG does not complete by 04:00 UTC **then** an SLA miss alert is emitted (SLA enforcement owned by airflow-dags per charter).

7. **When** the DAG is paused (e.g., by operator intervention) **then** no schedule-triggered runs occur; manual triggers remain possible.

### Postconditions

- `customer_ltv` table is refreshed daily with `computed_at >= 04:00 UTC`
- Any failure is visible to oncall within 5 minutes of the retry cycle completing

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| dbt command not found | Task fails immediately, no retries, alert emitted |
| Transient DB error | Retry up to 2 times, then alert on failure |
| dbt test fails (schema violation) | Task fails, alert emitted, LTV table is left in previous state |
| SLA miss (>04:00 UTC) | Alert emitted, DAG continues running |

## Acceptance Criteria

- [ ] DAG runs daily at 02:00 UTC with `catchup=False`
- [ ] Task sequence: `dbt run --select customer_ltv` then `dbt test --select customer_ltv`
- [ ] Failed runs retry up to 2 times with exponential backoff
- [ ] Success events emitted to oncall channel
- [ ] Failure events emitted to oncall channel with error detail
- [ ] SLA alert emitted if DAG doesn't complete by 04:00 UTC
- [ ] DAG parses without error (`python -m airflow dags list`)
- [ ] Unit tests cover retry logic and alert paths
