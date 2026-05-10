# Implementation Plan: Customer Orders Query

> **Methodology:** adev
> **Charter:** .context-index/specs/features/orders/charter.md
> **Spec:** .context-index/specs/features/orders/customer-orders.md
> **Review:** PASS (2026-04-28)
> **Platform:** Node.js 22, JavaScript (ESM), pg, node:test

**Goal:** Implement `getOrdersByCustomer(customerId)` — a parameterized query against the `orders` table that returns all orders for a given customer, ordered by ID ascending.

**Architecture:** The function lives in `lib/orders.mjs` and uses the singleton connection pool from `lib/db.mjs`. Tests are integration-only — they execute real SQL against a PostgreSQL instance seeded by `seed/init.sql`. No mocking is permitted. The pool must be torn down in an `after()` hook to prevent hanging connections.

---

## File Structure

**Create:**
- `tests/orders.integration.test.mjs` — Integration test suite for `getOrdersByCustomer`

**Modify:**
- `lib/orders.mjs` — Add `getOrdersByCustomer(customerId)` function

**Reference (read, do not modify):**
- `lib/db.mjs` — Connection pool singleton (`getPool()`, `closePool()`)
- `seed/init.sql` — Schema definition and deterministic seed data
- `docker-compose.yml` — PostgreSQL service definition (port 5433)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/orders/customer-orders.md` (all acceptance criteria)
- Charter: `.context-index/specs/features/orders/charter.md` (capability 1: Query orders by customer)
- Constitution: `.context-index/constitution.md` (principles 1-5: real database tests, fail hard, deterministic seed, pure ESM, clean teardown)
- Platform: `.context-index/platform-context.yaml` (node:test runner, pg, docker-compose postgres)
- Reference: `seed/init.sql` (seed data values for assertions)
- Reference: `lib/db.mjs` (pool API: `getPool()`, `closePool()`)

### Task 2 Context
- Spec: `.context-index/specs/features/orders/customer-orders.md` (acceptance criteria 1-5)
- Charter: `.context-index/specs/features/orders/charter.md` (capability 1: Query orders by customer)
- Reference: `lib/db.mjs` (pool API: `getPool()`)
- Reference: `seed/init.sql` (table schema for column selection)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 implements the function that Task 1 tests)

All tasks are sequential. Task 1 writes the failing test; Task 2 implements the function to make it pass.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write integration tests for `getOrdersByCustomer` | medium | integration | — | 1 create, 0 modify |
| 2 | Implement `getOrdersByCustomer` in `lib/orders.mjs` | small | integration | Task 1 | 0 create, 1 modify |

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| integration | 2 | spec-declared (confidence: 0.95) |

## Test Infrastructure Requirements

> These requirements must be satisfied before integration tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| PostgreSQL 16 (docker-compose) | Task 1, Task 2 | integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `PGHOST` | PostgreSQL connection | Defaults to `localhost` in `lib/db.mjs` |
| `PGPORT` | PostgreSQL connection | Defaults to `5433` in `lib/db.mjs` |
| `PGDATABASE` | PostgreSQL connection | Defaults to `integration_sandbox` in `lib/db.mjs` |
| `PGUSER` | PostgreSQL connection | Defaults to `sandbox` in `lib/db.mjs` |
| `PGPASSWORD` | PostgreSQL connection | Defaults to `sandbox_pass` in `lib/db.mjs` |

### Pre-Provisioned State

- [ ] PostgreSQL container running via `npm run db:up`
- [ ] Seed data loaded from `seed/init.sql` (auto-loaded on container start)

### CI Configuration

```bash
npm run db:up          # Start PostgreSQL container
npm run test:integration  # Run integration tests
npm run db:down        # Tear down container
```

---

## Tasks

### Task 1: Write integration tests for `getOrdersByCustomer` [specialist: none]

**Charter capability:** Query orders by customer
**Strategy:** integration (source: spec-declared, confidence: 0.95)
**Files:**
- Create: `tests/orders.integration.test.mjs`
- Test: `tests/orders.integration.test.mjs`

**Context to load:**
- `.context-index/specs/features/orders/customer-orders.md` (all acceptance criteria)
- `seed/init.sql` (seed data for assertion values)
- `lib/db.mjs` (pool API for setup/teardown)

- [ ] **Write failing test**

```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../lib/db.mjs';
import { getOrdersByCustomer } from '../lib/orders.mjs';

describe('getOrdersByCustomer — integration', () => {
  after(async () => {
    await closePool();
  });

  it('returns all orders for customer 1 (2 orders)', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 101);
    assert.equal(rows[1].id, 102);
  });

  it('returns orders ordered by id ascending', async () => {
    const rows = await getOrdersByCustomer(1);
    const ids = rows.map(r => r.id);
    assert.deepStrictEqual(ids, [101, 102]);
  });

  it('returns correct column types', async () => {
    const rows = await getOrdersByCustomer(1);
    const row = rows[0];
    assert.equal(typeof row.id, 'number');
    assert.equal(typeof row.customer_id, 'number');
    assert.equal(typeof row.total_cents, 'number');
    assert.equal(typeof row.status, 'string');
    assert.ok(row.created_at instanceof Date);
  });

  it('returns correct seed data values for customer 1', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows[0].total_cents, 4999);
    assert.equal(rows[0].status, 'completed');
    assert.equal(rows[1].total_cents, 1250);
    assert.equal(rows[1].status, 'completed');
  });

  it('returns single order for customer 2', async () => {
    const rows = await getOrdersByCustomer(2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 103);
    assert.equal(rows[0].total_cents, 7500);
    assert.equal(rows[0].status, 'pending');
  });

  it('returns single order for customer 3', async () => {
    const rows = await getOrdersByCustomer(3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 104);
    assert.equal(rows[0].total_cents, 0);
    assert.equal(rows[0].status, 'cancelled');
  });

  it('returns empty array for non-existent customer', async () => {
    const rows = await getOrdersByCustomer(999);
    assert.deepStrictEqual(rows, []);
  });
});
```

**Test rationale:**
- **AC 1 (returns all orders, ordered by ID):** Covered by "returns all orders for customer 1" and "returns orders ordered by id ascending" test cases. Customer 1 has 2 orders (101, 102) per seed data.
- **AC 2 (empty array for no orders):** Covered by "returns empty array for non-existent customer" (customer 999 has no orders in seed data).
- **AC 3 (correct column types):** Covered by "returns correct column types" — asserts `number` for id/customer_id/total_cents, `string` for status, `Date` for created_at.
- **AC 4 (parameterized query):** Verified implicitly — if the query used string interpolation instead of `$1`, it would still pass these tests, but the implementation task enforces the parameterized pattern. The test verifies correct behavior; code review verifies the parameterization.
- **AC 5 (seed data correctness):** Covered by tests for customers 1, 2, and 3, each asserting exact seed values from `seed/init.sql`.

**Prohibited patterns (per spec and constitution):**
- No `describe.skip`, `describe.skipIf`, or skip guards of any kind
- No mocking of `pg`, `Pool`, or `pool.query`
- No `process.exit` guards for missing infrastructure
- No asserting against hardcoded values without executing the query

**Required patterns:**
- Direct connection to PostgreSQL via `lib/db.mjs`
- `after()` hook calling `closePool()` for clean teardown
- Assertions against seed data values from `seed/init.sql`

- [ ] **Verify test fails** — Run `npm run test:integration` and confirm the test suite fails because `getOrdersByCustomer` is not yet implemented (import error or function returns incorrect results).

- [ ] **Commit**

```
test(orders): add integration tests for getOrdersByCustomer

Spec: .context-index/specs/features/orders/customer-orders.md
Plan-task: 1
```

---

### Task 2: Implement `getOrdersByCustomer` in `lib/orders.mjs` [specialist: none]

**Charter capability:** Query orders by customer
**Strategy:** integration (source: spec-declared, confidence: 0.95)
**Depends on:** Task 1
**Files:**
- Modify: `lib/orders.mjs` — Add `getOrdersByCustomer` function
- Test: `tests/orders.integration.test.mjs`

**Context to load:**
- `.context-index/specs/features/orders/customer-orders.md` (behavioral contract and AC 4 for parameterized query)
- `lib/db.mjs` (pool API: `getPool()` returns a `pg.Pool` instance)
- `seed/init.sql` (table schema: orders has columns id, customer_id, total_cents, status, created_at)

- [ ] **Implement the function**

Add `getOrdersByCustomer` to `lib/orders.mjs`:

```javascript
import { getPool } from './db.mjs';

/**
 * Fetch all orders for a customer, ordered by order ID.
 * Returns rows with { id, customer_id, total_cents, status, created_at }.
 */
export async function getOrdersByCustomer(customerId) {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, customer_id, total_cents, status, created_at FROM orders WHERE customer_id = $1 ORDER BY id',
    [customerId]
  );
  return rows;
}
```

**Implementation notes:**
- Uses `$1` parameterized placeholder per AC 4 — no string interpolation
- Selects explicit columns (id, customer_id, total_cents, status, created_at) rather than `SELECT *` to match the behavioral contract
- `ORDER BY id` satisfies AC 1 (ordered by ID ascending)
- Returns `rows` directly — empty array when no rows match (AC 2)
- Column types are determined by `pg` driver parsing: `SERIAL` → number, `INTEGER` → number, `TEXT` → string, `TIMESTAMPTZ` → Date (AC 3)

- [ ] **Verify tests pass** — Run `npm run test:integration` and confirm all 7 test cases pass.

- [ ] **Commit**

```
feat(orders): implement getOrdersByCustomer with parameterized query

Spec: .context-index/specs/features/orders/customer-orders.md
Plan-task: 2
```

---

## Quality Gates

### Pre-Implementation
- PostgreSQL is running: `npm run db:up`
- Seed data is loaded: verified by `SELECT count(*) FROM orders` returning 4

### Post-Implementation
- All 7 integration tests pass: `npm run test:integration`
- No skip guards or mocks in test file
- `closePool()` called in `after()` hook
- Query uses `$1` parameterized placeholder (no string interpolation)
- Function is exported from `lib/orders.mjs`

### Full Test Suite
```bash
npm test
```

---

## Execution Handoff

This plan is ready for `/adev:implement`. Two tasks, sequential execution:

1. **Task 1** creates the integration test file with 7 test cases covering all 5 acceptance criteria. Tests will fail initially because the function does not exist yet (RED phase).
2. **Task 2** implements the function in `lib/orders.mjs`. All tests should pass after implementation (GREEN phase).

**Infrastructure prerequisite:** PostgreSQL must be running before test execution. Start with `npm run db:up`. The container auto-loads `seed/init.sql` on first run.

**Critical constraint:** Tests must never skip when PostgreSQL is unavailable. A connection error (ECONNREFUSED) is the correct failure mode — it signals that infrastructure is not provisioned, not that the test should be bypassed.
