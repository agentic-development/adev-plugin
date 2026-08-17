---
charter: test-strategies
charter-extension: true
status: implemented
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-05-04
source-manifest:
  files:
    - lib/test-strategies/profiles/schema.md
    - lib/test-strategies/profiles.mjs
  computed-at: "2026-05-10T23:51:01.456Z"
---

# Spec: Schema Strategy Profile

## Capability

Define the complete rule set for the `schema` test strategy, enabling TDD for database migrations, schema changes, and data integrity validation.

## Behavioral Contract

### Preconditions

- The task involves database migration files (detected via `migrations/`, `prisma/migrations/`, `alembic/versions/`, `flyway/` paths)
- A test database or ephemeral container is available for migration testing
- The strategy profile contract (`getStrategyProfile`) can load this profile

### Behaviors

1. **When** write-test loads the schema profile **then** it uses these RED/GREEN semantics: RED means the migration assertion script exits non-zero because the expected schema state does not exist yet; GREEN means the migration applies successfully and all schema assertions pass on seeded data
2. **When** write-test authors tests for a schema task **then** it writes schema assertion scripts that verify: column existence and types, constraint presence (PK, FK, NOT NULL, UNIQUE), index existence, and data preservation after migration
3. **When** write-test checks for gaming in schema tests **then** it detects these strategy-specific patterns: testing on an empty database (no seeded data), asserting only that migration runs without error (no schema state assertions), missing rollback verification, and asserting column count instead of specific columns
4. **When** write-test applies assertion rules for schema tests **then** it requires: assertions against a database seeded with representative production-like data, both forward migration AND rollback assertions, explicit schema state checks (not just "migration ran")
5. **When** write-test applies seed data rules **then** it requires: representative production-like data seeded BEFORE migration runs, data that exercises edge cases (NULLs, foreign key references, large values), and verification that existing data survives the migration intact
6. **When** write-test produces the handoff block **then** it includes: migration file paths, assertion script paths, seed data script or fixture paths, pre-migration schema snapshot, and expected post-migration schema state
7. **When** a schema test's RED state is verified **then** the assertion script must fail because the schema change has not been applied yet — not because of a connection error or missing seed data

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| No database connection available | Advisory: "Schema tests require a test database — ensure one is configured" | SCHEMA_NO_DB |
| Migration file not found in task paths | Fall back to unit profile | SCHEMA_NO_MIGRATION |
| Seed data script fails | Block RED phase until seed data is fixed | SCHEMA_SEED_FAILED |

## Constitution Reference

- "Skills are primarily markdown" — The schema profile is a markdown document consumed by write-test as structured instructions
- "Minimize external dependencies" — Schema assertions use the project's existing migration tool (Prisma, Flyway, etc.), not new dependencies

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write schema profile markdown | Create `lib/test-strategies/profiles/schema.md` with all required fields | medium |
| Write schema profile tests | Verify profile loads correctly and all fields are present | small |
| Document schema testing patterns | Examples of good vs. gaming schema assertions | small |

## Acceptance Criteria

- [ ] Profile file contains all 8 required fields (strategy_id, red_exit_condition, green_exit_condition, gaming_blockers, assertion_rules, seed_data_rule, handoff_format, permitted_tools)
- [ ] gaming_blockers includes at least: empty DB testing, migration-runs-only assertions, missing rollback, column-count-only
- [ ] seed_data_rule requires representative production-like data
- [ ] handoff_format includes migration paths, assertion scripts, seed data, and schema snapshots
- [ ] `getStrategyProfile('schema')` loads the profile without fallback
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
