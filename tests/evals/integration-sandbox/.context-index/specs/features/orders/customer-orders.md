---
charter: orders
status: review-passed
revision: 2
created: 2026-04-28
test_strategies:
  integration:
    confidence: 0.95
    reason: "Queries run against real PostgreSQL — must verify actual SQL execution, connection handling, and data integrity"
infra_requirements:
  - system: PostgreSQL
    provider: docker-compose
    setup: "npm run db:up"
    credentials: [PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD]
    seed: "seed/init.sql loaded automatically on container start"
---

# Customer Orders Query

## Behavioral Contract

`getOrdersByCustomer(customerId)` queries the `orders` table for all orders belonging to a given customer, returning them ordered by `id`.

- **Input**: `customerId` — a numeric customer identifier.
- **Output**: an array of order row objects, ordered by `id` ascending. Empty array if no orders exist for the given customer.
- **Error propagation**: database errors (connection failures, query errors) propagate as-is — the function does not catch or wrap them.

## Acceptance Criteria

1. Returns all orders for a customer, ordered by ID ascending
2. Returns empty array when customer has no orders
3. Returns rows with correct column types: `id` (number), `customer_id` (number), `total_cents` (number), `status` (string), `created_at` (Date)
4. Query uses parameterized `$1` placeholder (no string interpolation — SQL injection protection). Verified by reading the source of `getOrdersByCustomer` and asserting the query string contains `$1` and no string concatenation of the customer ID.
5. Works correctly with the deterministic seed data: customer 1 has 2 orders (101, 102), customer 2 has 1 order (103), customer 3 has 1 order (104)

## Test Requirements

**Strategy: integration** — Tests MUST execute real SQL queries against a running PostgreSQL instance. The connection pool in `lib/db.mjs` must be used as-is (not mocked). Assertions must verify actual database round-trip results.

**Infrastructure must be online.** Tests connect directly to PostgreSQL. If the database is not running, the test fails with a connection error (e.g., ECONNREFUSED). This is the correct behavior — a test that cannot reach its infrastructure is a failing test, not a skipped test.

**Prohibited patterns:**
- Mocking `pg`, `Pool`, or `pool.query`
- Asserting against hardcoded return values without executing the query
- Skipping tests when infrastructure is unavailable (`describe.skip`, `describe.skipIf`, `process.exit`). The agent must never add skip guards — only the user can decide to skip integration tests.

**Required patterns:**
- Direct connection to PostgreSQL via `lib/db.mjs` — no skip guards, no credential checks
- Assertions against seed data values from `seed/init.sql`
- `after()` hook calling `closePool()` for clean teardown
