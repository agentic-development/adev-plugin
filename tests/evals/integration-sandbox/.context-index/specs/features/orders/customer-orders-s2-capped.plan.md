---
spec: customer-orders
charter: orders
status: draft
created: 2026-05-02
strategy: s2-capped
tasks: 3
---

# Implementation Plan — Customer Orders Query

**Spec:** `customer-orders.md` (review-passed)
**Charter:** orders (Capability #1)

## File Structure

| File | Purpose | Action |
|------|---------|--------|
| `lib/orders.mjs` | `getOrdersByCustomer(customerId)` function | Create |
| `lib/db.mjs` | Connection pool (singleton) | Exists — use as-is |
| `tests/orders.test.mjs` | Integration tests against real PostgreSQL | Create |
| `seed/init.sql` | Schema + deterministic seed data | Exists — reference only |

## Task Table

| # | Task | Type | TDD | Depends | Est |
|---|------|------|-----|---------|-----|
| 1 | Write failing integration tests for `getOrdersByCustomer` | RED | -- | -- | S |
| 2 | Implement `getOrdersByCustomer` in `lib/orders.mjs` | GREEN | T1 | T1 | S |
| 3 | Verify all tests pass, clean teardown, no mocks | VALIDATE | T1,T2 | T2 | S |

## Task Details

### Task 1 — RED: Write failing integration tests

**Goal:** Create `tests/orders.test.mjs` with tests that fail because `lib/orders.mjs` does not yet export `getOrdersByCustomer`.

**Context Packet:**
- Read: `seed/init.sql` — for exact seed data values
- Read: `lib/db.mjs` — for pool export shape and `closePool` signature
- Ref: spec acceptance criteria 1-5

**Test cases:**

```javascript
// tests/orders.test.mjs
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getOrdersByCustomer } from '../lib/orders.mjs';
import { closePool } from '../lib/db.mjs';

describe('getOrdersByCustomer', () => {
  after(() => closePool());

  it('returns all orders for customer 1 ordered by id', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 101);
    assert.equal(rows[1].id, 102);
  });

  it('returns correct column types', async () => {
    const [row] = await getOrdersByCustomer(1);
    assert.equal(typeof row.id, 'number');
    assert.equal(typeof row.customer_id, 'number');
    assert.equal(typeof row.total_cents, 'number');
    assert.equal(typeof row.status, 'string');
    assert.ok(row.created_at instanceof Date);
  });

  it('returns 1 order for customer 2', async () => {
    const rows = await getOrdersByCustomer(2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 103);
  });

  it('returns empty array for customer with no orders', async () => {
    const rows = await getOrdersByCustomer(9999);
    assert.deepEqual(rows, []);
  });
});
```

**Exit criteria:** Tests exist and fail with import/module error (function not found).

**Prohibited patterns (from spec):**
- No mocking `pg`, `Pool`, or `pool.query`
- No `describe.skip` or `describe.skipIf`
- No skip guards for missing infrastructure

---

### Task 2 — GREEN: Implement `getOrdersByCustomer`

**Goal:** Create `lib/orders.mjs` exporting `getOrdersByCustomer(customerId)` that makes Task 1 tests pass.

**Context Packet:**
- Read: `lib/db.mjs` — pool.query interface
- Ref: spec behavioral contract and AC #4 (parameterized query)

**Implementation:**

```javascript
// lib/orders.mjs
import { pool } from './db.mjs';

export async function getOrdersByCustomer(customerId) {
  const { rows } = await pool.query(
    'SELECT id, customer_id, total_cents, status, created_at FROM orders WHERE customer_id = $1 ORDER BY id ASC',
    [customerId]
  );
  return rows;
}
```

**Key constraints:**
- Must use `$1` parameterized placeholder (AC #4)
- Must ORDER BY id ASC (AC #1)
- Must return `rows` array directly (empty array when no matches — AC #2)
- Must use pool from `lib/db.mjs` — no new pool creation

**Exit criteria:** All Task 1 tests pass green.

---

### Task 3 — VALIDATE: Full verification

**Goal:** Confirm implementation meets all acceptance criteria and constitution principles.

**Context Packet:**
- Read: spec acceptance criteria 1-5
- Read: constitution principles (real DB, fail hard, deterministic seed, clean teardown)

**Checks:**
1. `npm test` passes — all tests green against running PostgreSQL
2. No mocks present in test file (grep for `mock`, `stub`, `spy`)
3. `closePool()` called in `after()` hook (clean teardown — constitution #5)
4. Query uses `$1` not string interpolation (AC #4, SQL injection protection)
5. Tests fail with ECONNREFUSED when PostgreSQL is down (constitution #2 — fail hard)

**Exit criteria:** All checks pass. Plan status moves to `complete`.

## Execution Order

```
T1 (RED) → T2 (GREEN) → T3 (VALIDATE)
```

Linear dependency chain. No parallelism possible — each task depends on the prior.

## Risk Notes

- Infrastructure dependency: PostgreSQL must be running (`npm run db:up`) before T1 tests can produce meaningful RED failures. The import error from missing `lib/orders.mjs` is sufficient for RED phase; actual DB assertions verify in T3.
