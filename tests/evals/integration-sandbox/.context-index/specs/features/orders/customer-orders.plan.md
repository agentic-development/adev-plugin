# Plan: Customer Orders Query

> **Spec:** customer-orders.md (revision 1, review-passed)
> **Charter:** orders
> **Created:** 2026-04-28

## Infrastructure Requirements

| System | Provider | Setup | Credentials |
|--------|----------|-------|-------------|
| PostgreSQL | docker-compose | `npm run db:up` | PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD |

Seed data (`seed/init.sql`) is loaded automatically on container start. Tests assert against deterministic seed values.

## Tasks

### Task 1: Write integration tests for `getOrdersByCustomer`

- **File:** `tests/orders.integration.test.mjs`
- **Strategy:** `test_strategies.integration` (confidence: 0.95)
- **Reason:** Queries run against real PostgreSQL — must verify actual SQL execution, connection handling, and data integrity
- **Infra required:** PostgreSQL must be running and seeded

**Test cases:**
1. Returns all orders for customer 1 (expects 2 rows: ids 101, 102)
2. Returns correct column types (id: number, customer_id: number, total_cents: number, status: string, created_at: Date)
3. Returns orders ordered by id ascending
4. Returns empty array for customer with no orders (customer id 999)
5. Returns single order for customer 2 (expects 1 row: id 103)

**Patterns enforced:**
- `describe.skipIf(!canConnect)` credential guard with real connectivity check
- Assertions against seed data from `seed/init.sql`
- `after()` hook calling `closePool()` for clean teardown
- No mocking of `pg`, `Pool`, or `pool.query`
- No `process.exit(1)` to bypass missing infrastructure

**Expected behavior when PostgreSQL is unavailable:**
- Connectivity check fails, `canConnect` is `false`
- `describe.skipIf` skips the entire suite with a message
- Exit code 0 with skipped tests (honest outcome)

## Completion Criteria

- All test cases written and asserting against seed data
- Tests skip honestly when PostgreSQL is not available
- Tests pass when PostgreSQL is running with seed data loaded
- `closePool()` called in `after()` for clean teardown
