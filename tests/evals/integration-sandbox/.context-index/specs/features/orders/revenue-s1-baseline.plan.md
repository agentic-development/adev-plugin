# Implementation Plan: Revenue By Customer Aggregation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/orders/charter.md
> **Spec:** .context-index/specs/features/orders/revenue-by-customer.md
> **Review:** PASS (2026-04-28)
> **Platform:** Node.js 22, JavaScript (ESM), pg, node:test

**Goal:** Add integration tests for `getRevenueByCustomer()` verifying LEFT JOIN aggregation, COALESCE zero-fill, status filtering, and correct seed-data sums against a real PostgreSQL instance.

**Architecture:** The function already exists in `lib/orders.mjs` (lines 20-34). It executes a LEFT JOIN from `customers` to `orders` filtered on `status = 'completed'`, with COALESCE for zero-revenue customers. The plan adds a dedicated integration test file following the same patterns established by the existing `tests/orders.integration.test.mjs`. No new modules or dependencies are required.

---

## File Structure

**Create:**
- `tests/revenue.integration.test.mjs` — Integration tests for `getRevenueByCustomer()`

**Modify:**
- (none — the function is already implemented in `lib/orders.mjs`)

**Reference (read, do not modify):**
- `lib/orders.mjs` — Contains `getRevenueByCustomer()` implementation
- `lib/db.mjs` — Connection pool singleton (`getPool`, `closePool`)
- `seed/init.sql` — Deterministic seed data (customers 1-3, orders 101-104)
- `tests/orders.integration.test.mjs` — Existing test file to follow as a pattern

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/orders/revenue-by-customer.md` (criteria 1-5)
- Charter: `.context-index/specs/features/orders/charter.md` (capability: Revenue aggregation)
- Constitution: `.context-index/constitution.md` (principles 1-5: real DB tests, fail hard, deterministic seed, pure ESM, clean teardown)
- Platform: `.context-index/platform-context.yaml` (node:test runner, PostgreSQL via docker-compose)
- Reference: `tests/orders.integration.test.mjs` (follow this test structure exactly)
- Reference: `lib/orders.mjs:20-34` (the function under test)
- Reference: `seed/init.sql` (seed values for assertions)

---

## Parallelization

- Group A (sequential): Task 1 only

Single-task plan — no parallelization needed.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Integration tests for getRevenueByCustomer | medium | integration | — | 1 create, 0 modify |

---

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| integration | 1 | spec-declared (confidence: 0.95) |

---

## Test Infrastructure Requirements

> These requirements must be satisfied before integration tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| PostgreSQL | Task 1 | integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `PGHOST` | PostgreSQL connection | Defaults to `localhost` in `lib/db.mjs` |
| `PGPORT` | PostgreSQL connection | Defaults to `5433` in `lib/db.mjs` |
| `PGDATABASE` | PostgreSQL connection | Defaults to `integration_sandbox` in `lib/db.mjs` |
| `PGUSER` | PostgreSQL connection | Defaults to `sandbox` in `lib/db.mjs` |
| `PGPASSWORD` | PostgreSQL connection | Defaults to `sandbox_pass` in `lib/db.mjs` |

### Pre-Provisioned State

- [ ] PostgreSQL running via `npm run db:up` (docker-compose)
- [ ] Seed data loaded from `seed/init.sql` (automatic on container start)

### CI Configuration

```bash
npm run db:up
npm test
```

> **Local runs:** `npm run db:up` provisions the database. Default credentials are hardcoded in `lib/db.mjs` for local development.

Strategy Distribution:
  integration · 1 task (source: spec-declared/high) — requires: PostgreSQL

---

### Task 1: Integration tests for getRevenueByCustomer [specialist: none]

**Charter capability:** Revenue aggregation (capability #2)
**Strategy:** integration (source: spec-declared, confidence: 0.95)
**Files:**
- Create: `tests/revenue.integration.test.mjs`

**Tests:** `tests/revenue.integration.test.mjs`

**Context to load:**
- `tests/orders.integration.test.mjs` — Follow this exact pattern for imports, connectivity check, describe/skip structure, and after() teardown
- `lib/orders.mjs` — Import `getRevenueByCustomer` from here
- `seed/init.sql` — Seed data values for assertions

- [ ] **Write failing test**

```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../lib/db.mjs';
import { getRevenueByCustomer } from '../lib/orders.mjs';

// Real connectivity check — attempt to connect to PostgreSQL.
let canConnect = false;
try {
  const pool = getPool();
  const client = await pool.connect();
  client.release();
  canConnect = true;
} catch {
  // PostgreSQL is not available — tests will be skipped honestly.
}

describe('getRevenueByCustomer — integration', { skip: !canConnect && 'PostgreSQL is not available — skipping integration tests' }, () => {
  after(async () => {
    await closePool();
  });

  it('returns one row per customer, ordered by customer_id', async () => {
    const rows = await getRevenueByCustomer();
    assert.equal(rows.length, 3);
    assert.deepStrictEqual(
      rows.map(r => r.customer_id),
      [1, 2, 3]
    );
  });

  it('sums revenue only from completed orders (Alice: 4999 + 1250 = 6249)', async () => {
    const rows = await getRevenueByCustomer();
    const alice = rows.find(r => r.customer_id === 1);
    assert.equal(alice.total_revenue_cents, 6249);
    assert.equal(alice.order_count, 2);
  });

  it('returns 0 revenue for customer with only pending orders (Bob)', async () => {
    const rows = await getRevenueByCustomer();
    const bob = rows.find(r => r.customer_id === 2);
    assert.equal(bob.total_revenue_cents, 0);
    assert.equal(bob.order_count, 0);
  });

  it('returns 0 revenue for customer with only cancelled orders (Charlie)', async () => {
    const rows = await getRevenueByCustomer();
    const charlie = rows.find(r => r.customer_id === 3);
    assert.equal(charlie.total_revenue_cents, 0);
    assert.equal(charlie.order_count, 0);
  });

  it('includes customer name in each row', async () => {
    const rows = await getRevenueByCustomer();
    assert.deepStrictEqual(
      rows.map(r => r.name),
      ['Alice', 'Bob', 'Charlie']
    );
  });

  it('returns integer types for revenue and count (not strings)', async () => {
    const rows = await getRevenueByCustomer();
    for (const row of rows) {
      assert.equal(typeof row.total_revenue_cents, 'number');
      assert.equal(typeof row.order_count, 'number');
      assert.equal(typeof row.customer_id, 'number');
    }
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/revenue.integration.test.mjs`
Expected: FAIL if PostgreSQL is not running (connection error); PASS if PostgreSQL is running with seed data (function already implemented).

Note: Since `getRevenueByCustomer()` is already implemented in `lib/orders.mjs`, the tests will pass immediately if PostgreSQL is up and seed data is loaded. This is acceptable — the spec requires integration testing of existing behavior, not new implementation. The value is in verifying the SQL execution against a real database.

- [ ] **Implement**

No implementation needed — `getRevenueByCustomer()` already exists in `lib/orders.mjs` (lines 20-34). This task is test-only.

- [ ] **Verify test passes**

Run: `node --test tests/revenue.integration.test.mjs`
Expected: PASS — all 6 test cases pass against seed data

- [ ] **Commit**

Branch (if not already created): `feat/orders/revenue-by-customer-tests`

```bash
git add tests/revenue.integration.test.mjs
git commit -m "test(orders): add integration tests for getRevenueByCustomer

Spec: .context-index/specs/features/orders/revenue-by-customer.md
Plan-task: 1"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [x] AC1: Returns one row per customer, ordered by customer ID
  - [x] AC2: Only completed orders contribute to revenue
  - [x] AC3: Customers with no completed orders appear with 0/0
  - [x] AC4: Revenue is summed in cents (integer)
  - [x] AC5: Seed data assertions (Alice=6249, Bob=0, Charlie=0)
