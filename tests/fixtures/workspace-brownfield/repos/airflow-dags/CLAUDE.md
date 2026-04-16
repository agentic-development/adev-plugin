# CLAUDE.md

## Identity

Airflow orchestration layer scheduling dbt runs and cross-system data pipelines.

## Non-Negotiable Principles

1. Idempotent tasks
2. All DAGs have retry and alerting
3. No business logic in DAGs
4. Start date is immutable once scheduled
5. No secrets in DAG code

## Quality Gates

```bash
pytest
python -m airflow dags list
```

See `.context-index/constitution.md` for the full constitution.
