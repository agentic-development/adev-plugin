# Plan: Revenue By Customer Aggregation

> **Spec:** revenue-by-customer.md (revision 1, review-passed)
> **Charter:** orders
> **Created:** 2026-05-02

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `tests/revenue.integration.test.mjs` | Integration tests for `getRevenueByCustomer()` |
| Existing | `lib/orders.mjs` | Already contains `getRevenueByCustomer()` implementation |
| Existing | `lib/db.mjs` | Connection pool (singleton) |
| Existing | `seed/init.sql` | Schema + deterministic seed data |

## Infrastructure Requirements

| System | Provider | Setup | Credentials |
|--------|----------|-------|-------------|
| PostgreSQL | docker-compose | `npm run db:up` | PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD |

Seed data (`seed/init.sql`) is loaded automatically on container start. Tests assert against deterministic seed values.

## Context Packets

### CP-1: Spec — Revenue By Customer

- **Source:** `.context-index/specs/features/orders/revenue-by-customer.md`
- **Key facts:**
  - `getRevenueByCustomer()` uses LEFT JOIN + COALESCE + GROUP BY
  - Returns `{ customer_id, name, total_revenue_cents, order_count }` per customer
  - Only `completed` orders contribute to revenue
  - Customers with zero completed orders still appear with `total_revenue_cents: 0` and `order_count: 0`
  - Revenue is in cents (integer, not float)

### CP-2: Seed Data

- **Source:** `seed/init.sql`
- **Key facts:**
  - Alice (id=1): orders 101 (4999 cents, completed) + 102 (1250 cents, completed) = 6249 cents, 2 orders
  - Bob (id=2): order 103 (7500 cents, pending) = 0 cents revenue, 0 completed orders
  - Charlie (id=3): order 104 (0 cents, cancelled) = 0 cents revenue, 0 completed orders

### CP-3: Existing Pattern — customer-orders tests

- **Source:** `tests/orders.integration.test.mjs`
- **Key patterns:**
  - Uses `node:test` (`describe`, `it`, `after`)
  - Real connectivity check with skip guard (`canConnect`)
  - Imports from `../lib/db.mjs` and `../lib/orders.mjs`
  - `after()` hook calls `closePool()`
  - Assertions use `node:assert/strict`

### CP-4: Implementation — getRevenueByCustomer()

- **Source:** `lib/orders.mjs` (lines 20-34)
- **Key facts:** Already implemented with LEFT JOIN, COALESCE, GROUP BY, ORDER BY c.id, status filter on `completed`

## Tasks

### Task 1: Write failing integration tests for `getRevenueByCustomer` (RED)

- **File:** `tests/revenue.integration.test.mjs` (create)
- **Strategy:** `test_strategies.integration` (confidence: 0.95)
- **Reason:** Aggregation query with LEFT JOIN, COALESCE, and GROUP BY must verify real SQL execution against Postgres
- **Infra required:** PostgreSQL must be running and seeded
- **Depends on:** none

**Test cases (map to acceptance criteria):**

1. **AC-1: One row per customer, ordered by customer ID**
   - Call `getRevenueByCustomer()`, assert `rows.length === 3`
   - Assert `rows[0].customer_id === 1`, `rows[1].customer_id === 2`, `rows[2].customer_id === 3`

2. **AC-2: Only completed orders contribute to revenue**
   - Assert Bob (customer_id=2) has `total_revenue_cents === 0` and `order_count === 0` (his pending order excluded)
   - Assert Charlie (customer_id=3) has `total_revenue_cents === 0` and `order_count === 0` (his cancelled order excluded)

3. **AC-3: Customers with no completed orders appear with zeroes (LEFT JOIN)**
   - Assert Bob appears in results with `total_revenue_cents === 0` and `order_count === 0`
   - Assert Charlie appears in results with `total_revenue_cents === 0` and `order_count === 0`

4. **AC-4: Revenue is summed in cents (integer)**
   - Assert `typeof rows[0].total_revenue_cents === 'number'`
   - Assert `Number.isInteger(rows[0].total_revenue_cents)` is true
   - Assert `typeof rows[0].order_count === 'number'`

5. **AC-5: Seed data exact values — Alice aggregation**
   - Assert Alice: `total_revenue_cents === 6249` (4999 + 1250), `order_count === 2`
   - Assert Bob: `total_revenue_cents === 0`, `order_count === 0`
   - Assert Charlie: `total_revenue_cents === 0`, `order_count === 0`

**Code snippet:**

```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../lib/db.mjs';
import { getRevenueByCustomer } from '../lib/orders.mjs';

let canConnect = false;
try {
  const pool = getPool();
  const client = await pool.connect();
  client.release();
  canConnect = true;
} catch {
  // PostgreSQL is not available
}

describe('getRevenueByCustomer — integration', { skip: !canConnect && 'PostgreSQL is not available — skipping integration tests' }, () => {
  after(async () => {
    await closePool();
  });

  it('returns one row per customer ordered by customer ID (AC-1)', async () => {
    const rows = await getRevenueByCustomer();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].customer_id, 1);
    assert.equal(rows[1].customer_id, 2);
    assert.equal(rows[2].customer_id, 3);
  });

  it('excludes pending and cancelled orders from revenue (AC-2)', async () => {
    const rows = await getRevenueByCustomer();
    const bob = rows.find(r => r.customer_id === 2);
    assert.equal(bob.total_revenue_cents, 0);
    assert.equal(bob.order_count, 0);
    const charlie = rows.find(r => r.customer_id === 3);
    assert.equal(charlie.total_revenue_cents, 0);
    assert.equal(charlie.order_count, 0);
  });

  it('includes customers with no completed orders via LEFT JOIN (AC-3)', async () => {
    const rows = await getRevenueByCustomer();
    const customerIds = rows.map(r => r.customer_id);
    assert.ok(customerIds.includes(2), 'Bob must appear despite having no completed orders');
    assert.ok(customerIds.includes(3), 'Charlie must appear despite having no completed orders');
  });

  it('returns revenue as integer cents (AC-4)', async () => {
    const rows = await getRevenueByCustomer();
    for (const row of rows) {
      assert.equal(typeof row.total_revenue_cents, 'number');
      assert.ok(Number.isInteger(row.total_revenue_cents));
      assert.equal(typeof row.order_count, 'number');
      assert.ok(Number.isInteger(row.order_count));
    }
  });

  it('computes correct aggregation from seed data (AC-5)', async () => {
    const rows = await getRevenueByCustomer();
    const alice = rows.find(r => r.customer_id === 1);
    assert.equal(alice.total_revenue_cents, 6249);
    assert.equal(alice.order_count, 2);
    assert.equal(alice.name, 'Alice');
    const bob = rows.find(r => r.customer_id === 2);
    assert.equal(bob.total_revenue_cents, 0);
    assert.equal(bob.order_count, 0);
    const charlie = rows.find(r => r.customer_id === 3);
    assert.equal(charlie.total_revenue_cents, 0);
    assert.equal(charlie.order_count, 0);
  });
});
```

**TDD protocol:**
1. Create the test file with the above content
2. Run `npm test` — tests should pass (implementation already exists in `lib/orders.mjs`)
3. Verify tests pass against the real database

**Commit:**
```
feat(orders): add integration tests for getRevenueByCustomer

Spec: .context-index/specs/features/orders/revenue-by-customer.md
Plan-task: 1
```

## Quality Gates

- [ ] All 5 test cases pass against a running PostgreSQL instance with seed data
- [ ] Tests skip honestly when PostgreSQL is not available (exit 0 with skip message)
- [ ] No mocking of `pg`, `Pool`, or `pool.query`
- [ ] `closePool()` called in `after()` for clean teardown
- [ ] Assertions verify LEFT JOIN behavior (Bob and Charlie appear with zeroes)
- [ ] Assertions verify COALESCE behavior (0 not NULL)
- [ ] Assertions verify aggregate sum (Alice: 4999 + 1250 = 6249)
- [ ] Assertions verify status filter (only `completed` contributes)
- [ ] `npm test` passes

## Task Summary

| # | Task | AC | Files | Depends |
|---|------|----|-------|---------|
| 1 | Write integration tests for `getRevenueByCustomer` | AC-1 through AC-5 | `tests/revenue.integration.test.mjs` | none |

> **Note:** The implementation (`getRevenueByCustomer()` in `lib/orders.mjs`) already exists. This plan focuses on writing the integration tests to validate the behavioral contract against the real database.

## Execution Handoff

```
/adev:implement --plan .context-index/specs/features/orders/revenue-t23-silent.plan.md
```
