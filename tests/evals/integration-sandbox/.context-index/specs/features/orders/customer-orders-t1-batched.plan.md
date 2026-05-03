---
spec: customer-orders
charter: orders
status: draft
created: 2026-05-02
strategy: tdd
tasks: 2
---

# Plan: Customer Orders Query

Spec: `.context-index/specs/features/orders/customer-orders.md`

## Task Summary

| # | Task | Type | File(s) | Depends |
|---|------|------|---------|---------|
| 1 | Write failing integration tests for `getOrdersByCustomer` | test | `tests/orders.test.mjs` | — |
| 2 | Implement `getOrdersByCustomer` in orders module | implement | `lib/orders.mjs` | 1 |

---

## Task 1 — Write failing integration tests

**Type:** test (RED phase)
**File:** `tests/orders.test.mjs`
**Acceptance Criteria covered:** AC-1, AC-2, AC-3, AC-4, AC-5

### What to do

Write an integration test file using `node:test` that imports `getOrdersByCustomer` from `lib/orders.mjs` and `closePool` from `lib/db.mjs`. Tests connect directly to PostgreSQL — no mocks, no skip guards.

### Test cases

1. **Returns all orders for customer 1, ordered by ID ascending** — call `getOrdersByCustomer(1)`, assert result length is 2, assert `rows[0].id === 101` and `rows[1].id === 102`.
2. **Returns single order for customer 2** — call `getOrdersByCustomer(2)`, assert length 1, assert `rows[0].id === 103`, `rows[0].total_cents === 7500`, `rows[0].status === 'pending'`.
3. **Returns empty array for non-existent customer** — call `getOrdersByCustomer(999)`, assert result is an array with length 0.
4. **Returns correct column types** — on the result for customer 1, assert: `typeof id === 'number'`, `typeof customer_id === 'number'`, `typeof total_cents === 'number'`, `typeof status === 'string'`, `created_at instanceof Date`.
5. **Uses parameterized query (SQL injection protection)** — import `getOrdersByCustomer` source or inspect its `.toString()` / read the source file, assert the query string contains `$1` and does not concatenate the customer ID via template literals or string concatenation.

### Teardown

`after()` hook calls `closePool()` for clean shutdown.

### Constraints

- Must use `node:test` and `node:assert`
- Must import pool from `lib/db.mjs` (real connection, no mocks)
- Must assert against seed data values from `seed/init.sql`
- Must NOT use `describe.skip`, `describe.skipIf`, or `process.exit` guards

---

## Task 2 — Implement `getOrdersByCustomer`

**Type:** implement (GREEN phase)
**File:** `lib/orders.mjs`
**Depends on:** Task 1 (tests must exist and fail before implementation)

### What to do

Create `lib/orders.mjs` exporting an async function `getOrdersByCustomer(customerId)` that:

1. Imports `getPool` from `./db.mjs`
2. Executes a parameterized query: `SELECT * FROM orders WHERE customer_id = $1 ORDER BY id ASC`
3. Returns `result.rows` (an array of row objects, empty if no matches)
4. Does NOT catch or wrap database errors — they propagate as-is

### Acceptance

All tests from Task 1 pass (`npm test`).

### Constraints

- Pure ESM (`.mjs`, named exports)
- Parameterized query with `$1` — no string interpolation of `customerId`
- No error wrapping — let `pg` errors propagate

---

## Next Steps

1. Run `/adev:write-test` for Task 1 to produce the failing test suite
2. Run `/adev:implement` for Task 2 to make tests green
3. Run `/adev:validate` to confirm all quality gates pass
