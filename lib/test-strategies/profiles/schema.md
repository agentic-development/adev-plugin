---
strategy_id: schema
red_exit_condition: "Migration assertion script exits non-zero because the expected schema state does not exist yet — column missing, constraint absent, or index not created"
green_exit_condition: "Migration applies successfully and all schema assertions pass — columns exist with correct types, constraints are present, indexes created, existing data preserved"
gaming_blockers:
  - "Testing on an empty database with no seeded data"
  - "Asserting only that migration runs without error — no schema state assertions"
  - "Missing rollback verification — only testing forward migration"
  - "Asserting column count instead of specific column names and types"
  - "Asserting table existence without checking constraints (PK, FK, NOT NULL, UNIQUE)"
assertion_rules: "Assert against a database seeded with representative production-like data. Both forward migration AND rollback must be verified. Assertions must check specific columns, types, and constraints — not just that the migration executed."
seed_data_rule: "Seed representative production-like data BEFORE migration runs. Include edge cases: NULLs, foreign key references, large values, unicode strings. Verify existing data survives the migration intact."
handoff_format: "Migration file paths + assertion script paths + seed data script/fixture paths + pre-migration schema snapshot + expected post-migration schema state"
permitted_tools:
  - "pgTAP"
  - "Testcontainers"
  - "Flyway"
  - "Liquibase"
  - "dbmate"
  - "Prisma migrate"
  - "Alembic"
  - "Django migrations"
  - "Entity Framework migrations"
---

# Schema Strategy Profile

Database migration testing profile. Verifies schema changes with assertions against seeded data, including rollback verification.
