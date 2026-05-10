[adev docs](../README.md) > [Project Types](../project-types.md) > Database Migrations

# Database Migrations Tool

**Repository:** [agentic-development/adev-migrations-eval](https://github.com/agentic-development/adev-migrations-eval)
**Fixture path:** `tests/evals/adev-migrations-eval/`

This example represents a database migrations tool — a utility that manages schema versioning and data migrations across environments.

## How `/adev:init` Detects This Project Type

For a migrations tool, `/adev:init` looks for:

- Migration files with sequential numbering or timestamps
- Database connection configuration
- CLI entry point for running migrations (up/down/status commands)
- Schema definition files or ORM configuration

## Constitution

```markdown
## Identity

Database migration tool for managing PostgreSQL schema changes
with versioned migrations, rollback support, and dry-run previews.

## Non-Negotiable Principles

1. **Ordered execution** — migrations run in strict sequential order.
   No gaps, no reordering, no parallel execution.
2. **Reversible by default** — every migration has a down() function.
   Irreversible migrations must be explicitly marked and approved.
3. **Idempotent checks** — running migrations against an already-migrated
   database is a no-op, not an error.
4. **No data loss without confirmation** — migrations that drop columns
   or tables require explicit `--destructive` flag.
```

## Manifest

```yaml
project:
  name: "db-migrate"
  type: cli

gates:
  test: "node --test tests/"

modules:
  - slug: core
    name: Migration Engine
    paths:
      - src/engine/
  - slug: cli
    name: CLI Interface
    paths:
      - src/cli/
  - slug: connectors
    name: Database Connectors
    paths:
      - src/connectors/
```

## Spec Example

Migration tool specs focus on ordering guarantees and data safety:

```markdown
## Behavioral Contract

### Behaviors
1. **When** `migrate up` runs **then** it applies all pending migrations
   in timestamp order and records each in the migrations table.
2. **When** `migrate down --steps 1` runs **then** it reverts only the
   most recent migration and updates the migrations table.
3. **When** a migration fails mid-execution **then** it rolls back that
   single migration and reports the error without affecting others.
```

---

[Back to Project Types](../project-types.md)
