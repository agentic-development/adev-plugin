# Implementation Plan: Revenue By Customer Aggregation

**Spec:** `.context-index/specs/features/orders/revenue-by-customer.md`
**Charter:** `.context-index/specs/features/orders/charter.md`
**Review verdict:** PASS (0 findings)
**Plan date:** 2026-05-03

---

## Context Summary

### From Constitution
- Real database tests are mandatory — no mocking `pg` or the connection pool
- Integration tests must fail with a connection error if PostgreSQL is offline — never skip
- Assertions must reference known seed data from `seed/init.sql`
- All files must be pure ESM (`.mjs`, `"type": "module"`)
- Tests creating data must clean up in `after()` hooks

### From Charter
- Domain: Customer (id, name, email), Order (id, customer_id, total_cents, status, created_at)
- Relationship: Customer 1:N Orders
- Statuses: pending, completed, cancelled
- Infrastructure: PostgreSQL via `pg` package, seed at `seed/init.sql`

### From Spec
- Function: `getRevenueByCustomer()` exported from `lib/orders.mjs`
- Aggregation: LEFT JOIN customers → orders, WHERE status = 'completed', GROUP BY customer_id
- COALESCE ensures 0 (not NULL) for customers with no completed orders
- Result ordered by customer ID
- Seed expectations: Alice=6249 cents, Bob=0 cents, Charlie=0 cents

### From Review
- PASS — no blockers, warnings, or suggestions. Ready for immediate planning.

---

## Task Decomposition

### Task 1 — Write failing integration test (RED phase)

**File:** `tests/orders.revenue.test.mjs`

**What to implement:**
- Import `getRevenueByCustomer` from `lib/orders.mjs`
- `describe('getRevenueByCustomer')` block with `after()` teardown (not needed — read-only, but include pool close)
- Test: "returns one row per customer ordered by customer ID"
  - Assert result has exactly 3 rows
  - Assert rows are ordered by customer id ascending
- Test: "Alice has 6249 cents from two completed orders"
  - Find Alice's row; assert `total_revenue_cents === 6249`, `order_count === 2`
- Test: "Bob has 0 cents — pending order excluded"
  - Find Bob's row; assert `total_revenue_cents === 0`, `order_count === 0`
- Test: "Charlie has 0 cents — cancelled order excluded"
  - Find Charlie's row; assert `total_revenue_cents === 0`, `order_count === 0`
- Test: "revenue values are integers, not floats"
  - Assert `Number.isInteger(row.total_revenue_cents)` for all rows

**TDD expectation:** All tests fail with `SyntaxError` or `TypeError` (function does not exist yet).

**Constitution checks:**
- Must connect to real PostgreSQL — no mocks
- Must fail with connection error if Postgres is offline (no try/catch around pool init)
- Seed data assertions are deterministic (from `seed/init.sql`)

---

### Task 2 — Implement `getRevenueByCustomer()` (GREEN phase)

**File:** `lib/orders.mjs`

**What to implement:**
- Export async function `getRevenueByCustomer()`
- SQL query:
  ```sql
  SELECT
    c.id AS customer_id,
    c.name,
    COALESCE(SUM(o.total_cents), 0) AS total_revenue_cents,
    COUNT(o.id) AS order_count
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'completed'
  GROUP BY c.id, c.name
  ORDER BY c.id ASC
  ```
- Use the `pool` singleton from `lib/db.mjs`
- Return array of plain objects with snake_case keys: `customer_id`, `name`, `total_revenue_cents`, `order_count`
- `total_revenue_cents` must be an integer (cast or parse from pg's numeric type)
- `order_count` must be an integer (parse from pg string if necessary)

**TDD expectation:** All tests in Task 1 now pass against real PostgreSQL with seed data.

**Constitution checks:**
- Read-only query — no teardown required
- COALESCE guarantees 0 not NULL for Bob and Charlie
- Status filter is in the JOIN condition, not a WHERE clause, to preserve the LEFT JOIN semantics

---

### Task 3 — Run quality gate

**Command:** `npm test`

**What to verify:**
- All tests in `tests/orders.revenue.test.mjs` pass
- No existing tests broken
- If PostgreSQL is offline, test file must exit non-zero with a connection error (not a skip)

**Expected outcome:** Green test suite, no regressions.

---

## Execution Order

| # | Task | File | Phase |
|---|------|------|-------|
| 1 | Write failing tests | `tests/orders.revenue.test.mjs` | RED |
| 2 | Implement `getRevenueByCustomer()` | `lib/orders.mjs` | GREEN |
| 3 | Run `npm test` and verify | — | VERIFY |

---

## Risk Notes

- `pg` returns numeric aggregates (SUM, COUNT) as strings in JavaScript — explicit parsing (`parseInt`, `Number`) is required to satisfy the integer assertion
- The LEFT JOIN filter `AND o.status = 'completed'` must be in the ON clause, not a WHERE clause; moving it to WHERE would convert the LEFT JOIN into an INNER JOIN, excluding Bob and Charlie
- No new dependencies required — `pg` pool is already present in `lib/db.mjs`
