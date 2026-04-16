# CLAUDE.md

## Identity

dbt transformation layer producing analytics-ready tables from raw source data.

## Non-Negotiable Principles

1. Idempotent transformations
2. Every model has tests
3. No hardcoded credentials
4. Source tables are immutable
5. Prefer SQL over macros

## Quality Gates

```bash
dbt test
dbt compile
```

See `.context-index/constitution.md` for the full constitution.
