# Constitution: airflow-dags

## Identity

Airflow orchestration layer scheduling dbt runs and cross-system data pipelines.

## Non-Negotiable Principles

1. **Idempotent tasks** — a task re-run must produce the same result.
2. **All DAGs have retry and alerting** — failures surface to the oncall channel.
3. **No business logic in DAGs** — DAGs orchestrate; transformation logic lives in dbt or service code.
4. **Start date is immutable once scheduled** — never rewrite history.
5. **No secrets in DAG code** — use Airflow Variables/Connections.

## Coding Standards

### Language and Runtime
- Python 3.11, Airflow 2.x

### Conventions
- snake_case for DAG ids and task ids
- DAG files in `dags/<domain>/<dag_name>.py`
- Shared operators in `plugins/operators/`
- No top-level database connections — use operator hooks

### Patterns
- TaskFlow API preferred over PythonOperator
- Explicit dependencies via `>>` or `set_downstream`
- Pools and priorities for resource-heavy tasks

## Architecture Boundaries

### Requires Human Approval
- Changing DAG schedules (can affect SLAs)
- Adding new Connections or Variables
- Adding new Airflow providers
- Renaming DAG ids (breaks history)

### Autonomous
- Adding tests
- Refactoring task logic
- Improving retry/alerting config
- Updating DAG documentation

## Quality Gates

```bash
pytest
python -m airflow dags list  # smoke check — DAGs parse without error
```
