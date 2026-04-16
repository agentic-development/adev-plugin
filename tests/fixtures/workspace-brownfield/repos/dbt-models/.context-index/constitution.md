# Constitution: dbt-models

## Identity

dbt transformation layer producing analytics-ready tables from raw source data.

## Non-Negotiable Principles

1. **Idempotent transformations** — running a model twice produces the same result.
2. **Every model has tests** — at minimum `not_null` and `unique` on primary keys.
3. **No hardcoded credentials** — database connections go through `profiles.yml` or env vars.
4. **Source tables are immutable** — only `ref()` other models or declared sources; never write to raw tables.
5. **Prefer SQL over macros** — macros only when SQL alone is insufficient.

## Coding Standards

### Naming
- `snake_case` for models and columns
- `stg_*` prefix for staging, `int_*` for intermediates, `fct_*`/`dim_*` for marts

### File Structure
- `models/staging/` — 1:1 source mappings
- `models/intermediate/` — reusable transformations
- `models/marts/` — analytics-ready tables

### SQL Style
- Lowercase keywords
- Trailing commas, leading commas in SELECT lists
- CTEs over subqueries
- Schema tests in `_<layer>.yml` files next to models

### Materializations
- `view` for staging
- `table` for marts
- `incremental` for large fact tables

## Architecture Boundaries

### Requires Human Approval
- Adding new source connections or databases
- Changing materializations of existing marts
- Modifying primary key definitions on production tables
- Adding new dbt packages
- Renaming or deleting production models

### Autonomous
- Writing new staging/intermediate models
- Adding schema tests to existing models
- Refactoring SQL within a model
- Updating documentation
- Fixing failing tests

## Quality Gates

```bash
dbt test
dbt compile
```
