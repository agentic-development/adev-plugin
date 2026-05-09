# Implementation Plan: Revenue By Customer Aggregation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/orders/charter.md
> **Spec:** .context-index/specs/features/orders/revenue-by-customer.md
> **Review:** PASS (2026-04-28)
> **Platform:** Node.js 22, JavaScript (ESM), PostgreSQL, node:test

**Goal:** Add integration tests for the `getRevenueByCustomer()` aggregation query, verifying LEFT JOIN, COALESCE, status filtering, and correct summation against deterministic seed data.

**Architecture:** The function already exists in `lib/orders.mjs` and follows the same pattern as `getOrdersByCustomer()` — it uses the shared connection pool from `lib/db.mjs` and runs a SQL query against the real database. Tests follow the existing pattern in `tests/orders.integration.test.mjs`: connect to the real PostgreSQL instance, assert against seed data from `seed/init.sql`, and close the pool in `after()`.

---

## File Structure

**Create:**
- `tests/revenue.integration.test.mjs` — Integration tests for `getRevenueByCustomer()`

**Modify:**
- (none — function already exists in `lib/orders.mjs`)

**Reference (read, do not modify):**
- `lib/orders.mjs:20-34` — The `getRevenueByCustomer()` implementation under test
- `lib/db.mjs` — Connection pool singleton
- `seed/init.sql` — Deterministic seed data for assertions
- `tests/orders.integration.test.mjs` — Follow this file's pattern for test structure, but do NOT copy the `canConnect` skip guard (constitution prohibits skipping when infra is offline)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/orders/revenue-by-customer.md` (all 5 acceptance criteria)
- Charter: `.context-index/specs/features/orders/charter.md` (capability: Revenue aggregation)
- Constitution: `.context-index/constitution.md` (principles: real database tests, fail hard when infra offline, deterministic seed data, clean teardown)
- Reference: `tests/orders.integration.test.mjs` (follow existing test pattern for imports and assertions, but do NOT copy the `canConnect` skip guard — constitution principle 2 prohibits skipping when infra is offline)
- Reference: `seed/init.sql` (seed values for assertions)

## Parallelization

- Single task — no parallelization applicable.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Integration tests for getRevenueByCustomer | medium | integration | — | 1 create, 0 modify |

## Strategy Summary

| Strategy | Tasks | Source |
|----------|-------|--------|
| integration | 1 | spec-declared |

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
| `PGHOST` | PostgreSQL | Default: `localhost` |
| `PGPORT` | PostgreSQL | Default: `5433` |
| `PGDATABASE` | PostgreSQL | Default: `integration_sandbox` |
| `PGUSER` | PostgreSQL | Default: `sandbox` |
| `PGPASSWORD` | PostgreSQL | Default: `sandbox_pass` |

### Pre-Provisioned State

- [ ] PostgreSQL instance running via `npm run db:up` (docker-compose)
- [ ] Seed data loaded from `seed/init.sql`

### CI Configuration

```bash
npm run db:up   # start PostgreSQL
npm test        # runs all integration tests
npm run db:down # teardown
```

---

### Task 1: Integration tests for getRevenueByCustomer [specialist: none]

**Charter capability:** Revenue aggregation
**Strategy:** integration (source: spec-declared, confidence: high)
**Files:**
- Create: `tests/revenue.integration.test.mjs`

**Tests:** `tests/revenue.integration.test.mjs`

**Context to load:**
- `tests/orders.integration.test.mjs` (follow import/assertion pattern, but NOT the `canConnect` skip guard — see constitution principle 2)
- `seed/init.sql` (seed values for assertions)
- `lib/orders.mjs:20-34` (function under test)

- [ ] **Write failing test**

Create `tests/revenue.integration.test.mjs`. Per constitution principle 2, do NOT include a `canConnect` skip guard — if PostgreSQL is offline, the test must fail hard with a connection error.

**Acceptance criteria → test mapping:**
| Criterion | Test |
|-----------|------|
| AC1 (one row per customer, ordered by ID) | "returns one row per customer, ordered by customer ID" |
| AC2 (only completed orders contribute) | "excludes pending orders" + "excludes cancelled orders" |
| AC3 (zero-revenue customers appear with 0) | "excludes pending orders" + "excludes cancelled orders" |
| AC4 (revenue in integer cents) | "returns revenue as integer cents, not floats" |
| AC5 (seed data values) | "sums revenue only from completed orders" |

```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../lib/db.mjs';
import { getRevenueByCustomer } from '../lib/orders.mjs';

// No skip guard — constitution principle 2: fail hard when infra is offline.

describe('getRevenueByCustomer — integration', () => {
  after(async () => {
    await closePool();
  });

  it('returns one row per customer, ordered by customer ID', async () => {
    const rows = await getRevenueByCustomer();
    assert.equal(rows.length, 3);
    assert.deepStrictEqual(rows.map(r => r.customer_id), [1, 2, 3]);
  });

  it('sums revenue only from completed orders (Alice: 4999 + 1250 = 6249)', async () => {
    const rows = await getRevenueByCustomer();
    const alice = rows.find(r => r.customer_id === 1);
    assert.equal(alice.total_revenue_cents, 6249);
    assert.equal(alice.order_count, 2);
  });

  it('excludes pending orders from revenue (Bob has 0 cents)', async () => {
    const rows = await getRevenueByCustomer();
    const bob = rows.find(r => r.customer_id === 2);
    assert.equal(bob.total_revenue_cents, 0);
    assert.equal(bob.order_count, 0);
  });

  it('excludes cancelled orders from revenue (Charlie has 0 cents)', async () => {
    const rows = await getRevenueByCustomer();
    const charlie = rows.find(r => r.customer_id === 3);
    assert.equal(charlie.total_revenue_cents, 0);
    assert.equal(charlie.order_count, 0);
  });

  it('returns revenue as integer cents, not floats', async () => {
    const rows = await getRevenueByCustomer();
    for (const row of rows) {
      assert.equal(typeof row.total_revenue_cents, 'number');
      assert.equal(row.total_revenue_cents, Math.floor(row.total_revenue_cents));
    }
  });

  it('includes customer name in each row', async () => {
    const rows = await getRevenueByCustomer();
    assert.deepStrictEqual(rows.map(r => r.name), ['Alice', 'Bob', 'Charlie']);
  });
});
```

- [ ] **Verify test wiring**

Since `getRevenueByCustomer()` already exists and is correct, the standard TDD red phase (test fails because the function doesn't exist) does not apply. Instead, verify the test harness is wired correctly:

Run: `node --test tests/revenue.integration.test.mjs`

If PostgreSQL is running: all 6 tests should PASS (confirming assertions match the implementation).
If PostgreSQL is offline: the test must FAIL with a connection error (not skip). This confirms the no-skip-guard is working per constitution principle 2.

- [ ] **Implement**

No implementation needed — `getRevenueByCustomer()` already exists in `lib/orders.mjs:20-34` with the correct LEFT JOIN, COALESCE, and GROUP BY logic.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — all tests in both `tests/orders.integration.test.mjs` and `tests/revenue.integration.test.mjs` pass.

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

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  1. Returns one row per customer, ordered by customer ID ✓
  2. Only completed orders contribute to revenue ✓
  3. Customers with no completed orders appear with 0 ✓
  4. Revenue is summed in cents (integer) ✓
  5. Seed data assertions match expected values ✓
