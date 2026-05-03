---
spec: customer-orders
charter: orders
created: 2026-05-02
status: draft
tasks: 2
---

# Plan: Customer Orders Query

## Spec Reference

`.context-index/specs/features/orders/customer-orders.md` (revision 2, review-passed)

## Task Table

| # | Task | Type | File(s) | Depends On | AC Covered |
|---|------|------|---------|------------|------------|
| 1 | Write failing integration tests for `getOrdersByCustomer` | RED test | `tests/orders.test.mjs` | -- | 1, 2, 3, 4, 5 |
| 2 | Implement `getOrdersByCustomer` to make tests pass | GREEN impl | `lib/orders.mjs` | 1 | 1, 2, 3, 4, 5 |

---

## Task 1 — Write failing integration tests (RED)

**Goal:** Create `tests/orders.test.mjs` with integration tests that import `getOrdersByCustomer` from `lib/orders.mjs` and assert against real PostgreSQL seed data. All tests must fail initially (function does not exist yet).

**Test cases:**

1. **Returns all orders for customer 1, ordered by ID ascending** — call `getOrdersByCustomer(1)`, assert result length is 2, assert `result[0].id === 101` and `result[1].id === 102`. (AC 1, 5)
2. **Returns empty array for customer with no orders** — call `getOrdersByCustomer(999)`, assert result is an array with length 0. (AC 2)
3. **Returns rows with correct column types** — from the customer 1 result, assert `typeof id === 'number'`, `typeof customer_id === 'number'`, `typeof total_cents === 'number'`, `typeof status === 'string'`, `created_at instanceof Date`. (AC 3)
4. **Uses parameterized query (no SQL injection)** — import `getOrdersByCustomer` source or the module, read the query string, and assert it contains `$1` and does not use string concatenation/interpolation for the customer ID. (AC 4)
5. **Seed data integrity for all customers** — call for customer 2 (expect 1 order, id 103), customer 3 (expect 1 order, id 104). Verify `total_cents` and `status` match seed values. (AC 5)

**Required patterns:**
- Import `getPool`, `closePool` from `lib/db.mjs` (used as-is, no mocking)
- `after(() => closePool())` for clean teardown
- No skip guards, no `describe.skip`, no credential checks
- Use `node:test` (`describe`, `it`) and `node:assert/strict`

**Context files:** `lib/db.mjs`, `seed/init.sql`, `customer-orders.md`

---

## Task 2 — Implement `getOrdersByCustomer` (GREEN)

**Goal:** Create `lib/orders.mjs` exporting `getOrdersByCustomer(customerId)` that queries PostgreSQL and returns matching order rows ordered by `id ASC`.

**Implementation requirements:**

1. Import `getPool` from `./db.mjs`
2. Execute a parameterized query: `SELECT * FROM orders WHERE customer_id = $1 ORDER BY id ASC` with `[customerId]` as parameter
3. Return `result.rows` (array of row objects, empty array if no matches)
4. Do not catch or wrap database errors — let them propagate as-is
5. No default exports; use named export `getOrdersByCustomer`

**Verification:** Run `npm test` — all tests from Task 1 must pass.

**Context files:** `lib/db.mjs`, `seed/init.sql`, `customer-orders.md`

---

## Next Steps

1. Run `npm run db:up` to ensure PostgreSQL is running
2. Execute Task 1 (write tests) and confirm all tests fail (RED)
3. Execute Task 2 (implement function) and confirm all tests pass (GREEN)
4. Run `npm test` for final quality gate
5. Update spec status from `review-passed` to `implemented`
6. Update charter capability status from `draft` to `implemented`
