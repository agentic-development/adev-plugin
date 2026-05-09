# Implementation Plan: Customer Orders Query

> **Methodology:** adev
> **Charter:** .context-index/specs/features/orders/charter.md
> **Spec:** .context-index/specs/features/orders/customer-orders.md
> **Review:** PASS (2026-04-28)
> **Platform:** javascript (ESM), node:test, PostgreSQL

**Goal:** Implement `getOrdersByCustomer(customerId)` in `lib/orders.mjs` with full integration test coverage against a real PostgreSQL instance, using deterministic seed data. Tests must connect directly to PostgreSQL with no skip guards, no mocks, and no bypass patterns.

**Architecture:** Single query function in `lib/orders.mjs` using the singleton connection pool from `lib/db.mjs`. Integration tests connect to PostgreSQL via docker-compose and assert against seed data loaded from `seed/init.sql`.

---

## File Structure

**Create:**
- `tests/orders.integration.test.mjs` — Integration tests for `getOrdersByCustomer`

**Modify:**
- `lib/orders.mjs` — Add `getOrdersByCustomer(customerId)` function

**Reference (read, do not modify):**
- `lib/db.mjs` — Connection pool singleton (`getPool`, `closePool`)
- `seed/init.sql` — Schema and deterministic seed data
- `docker-compose.yml` — PostgreSQL container configuration

## Context Packets

### Task 1 Context
- Spec: `customer-orders.md` (AC 1-5, Test Requirements)
- Constitution: `constitution.md` (Non-Negotiable Principles 1-3)
- Reference: `lib/db.mjs` (pool API: `getPool()`, `closePool()`)
- Reference: `seed/init.sql` (seed data: customers 1-3, orders 101-104)

### Task 2 Context
- Spec: `customer-orders.md` (AC 1, AC 2, AC 5)
- Reference: `seed/init.sql` (customer 1 has orders 101+102, customer 2 has 103, customer 3 has 104)

### Task 3 Context
- Spec: `customer-orders.md` (AC 3, AC 4)
- Reference: `lib/db.mjs` (pool.query returns `{ rows }`)

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (Task 1 creates the test file, Tasks 2-3 extend it and the implementation)

---

### Task 1: Write integration test for getOrdersByCustomer [specialist: none]

**Charter capability:** Query orders by customer
**Files:**
- Create: `tests/orders.integration.test.mjs`
- Modify: `lib/orders.mjs` (stub only — enough to import)

**Tests:** `tests/orders.integration.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../lib/db.mjs';
import { getOrdersByCustomer } from '../lib/orders.mjs';

describe('getOrdersByCustomer — integration', () => {
  after(async () => {
    await closePool();
  });

  it('returns all orders for customer 1, ordered by id ascending', async () => {
    const rows = await getOrdersByCustomer(1);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, 101);
    assert.equal(rows[1].id, 102);
  });

  it('returns empty array when customer has no orders', async () => {
    const rows = await getOrdersByCustomer(999);
    assert.deepStrictEqual(rows, []);
  });

  it('returns rows with correct column types', async () => {
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

  it('returns single order for customer 2 (seed data)', async () => {
    const rows = await getOrdersByCustomer(2);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 103);
    assert.equal(rows[0].total_cents, 7500);
    assert.equal(rows[0].status, 'pending');
  });

  it('returns single order for customer 3 (seed data)', async () => {
    const rows = await getOrdersByCustomer(3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 104);
    assert.equal(rows[0].total_cents, 0);
    assert.equal(rows[0].status, 'cancelled');
  });
});
```

**Critical constraints (from spec and constitution):**
- NO skip guards (`describe.skip`, `describe.skipIf`, conditional skipping based on connectivity checks)
- NO mocking of `pg`, `Pool`, or `pool.query`
- NO `process.exit` or early bail-out when PostgreSQL is unavailable
- Direct import of `closePool` from `lib/db.mjs` — call in `after()` hook
- If PostgreSQL is not running, the test MUST fail with a connection error (ECONNREFUSED). This is correct behavior.

- [ ] **Verify test fails**

Run: `node --test tests/orders.integration.test.mjs`
Expected: FAIL — `getOrdersByCustomer` not exported from `lib/orders.mjs` (or module not found)

- [ ] **Implement stub**

Create `lib/orders.mjs` with a minimal export so the test file can import it:

```javascript
import { getPool } from './db.mjs';

/**
 * Fetch all orders for a customer, ordered by order ID.
 * Returns rows with { id, customer_id, total_cents, status, created_at }.
 */
export async function getOrdersByCustomer(customerId) {
  // TODO: implement
  return [];
}
```

- [ ] **Verify test fails with assertion errors** (not import errors)

Run: `node --test tests/orders.integration.test.mjs`
Expected: FAIL — assertion failures (e.g., `rows.length` is 0, not 2). This confirms the test is correctly wired up and the RED phase is complete.

- [ ] **Commit**

```bash
git add tests/orders.integration.test.mjs lib/orders.mjs
git commit -m "test(orders): add failing integration tests for getOrdersByCustomer

Spec: .context-index/specs/features/orders/customer-orders.md
Plan-task: 1"
```

### Task 2: Implement getOrdersByCustomer query [specialist: none]

**Charter capability:** Query orders by customer
**Depends on:** Task 1
**Files:**
- Modify: `lib/orders.mjs` — replace stub with real query

**Tests:** `tests/orders.integration.test.mjs` (already written in Task 1)

- [ ] **Write failing test**

Tests already exist from Task 1. Verify they still fail:

Run: `node --test tests/orders.integration.test.mjs`
Expected: FAIL — stub returns empty array

- [ ] **Implement**

Replace the stub in `lib/orders.mjs` with the real parameterized query:

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

Key implementation notes:
- Uses `$1` parameterized placeholder (AC 4 — SQL injection protection)
- Selects explicit columns: `id`, `customer_id`, `total_cents`, `status`, `created_at`
- `ORDER BY id` ensures ascending order (AC 1)
- Returns `rows` directly — empty array when no matches (AC 2)
- Column types are determined by PostgreSQL driver mapping: `integer` → `number`, `text` → `string`, `timestamptz` → `Date` (AC 3)

- [ ] **Verify test passes**

Run: `node --test tests/orders.integration.test.mjs`
Expected: PASS — all 6 tests pass

- [ ] **Commit**

```bash
git add lib/orders.mjs
git commit -m "feat(orders): implement getOrdersByCustomer with parameterized query

Spec: .context-index/specs/features/orders/customer-orders.md
Plan-task: 2"
```

### Task 3: Verify SQL injection protection [specialist: none]

**Charter capability:** Query orders by customer
**Depends on:** Task 2
**Files:**
- Modify: `tests/orders.integration.test.mjs` — add parameterized query verification test

**Tests:** `tests/orders.integration.test.mjs`

- [ ] **Write failing test**

Add a test that verifies the query uses parameterized placeholders (AC 4). This is a source-code verification test:

```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

it('uses parameterized $1 placeholder, not string interpolation (AC 4)', () => {
  const source = readFileSync(join(__dirname, '..', 'lib', 'orders.mjs'), 'utf-8');
  // Verify parameterized query pattern
  assert.match(source, /\$1/);
  // Verify no string interpolation in the query
  assert.doesNotMatch(source, /`SELECT.*\$\{/);
  assert.doesNotMatch(source, /'SELECT.*' \+/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/orders.integration.test.mjs`
Expected: FAIL — test not yet added to the describe block (import error or test not wired)

- [ ] **Implement**

Add the imports (`readFileSync`, `fileURLToPath`, `dirname`, `join`) at the top of the test file and place the test inside the existing `describe` block.

- [ ] **Verify test passes**

Run: `node --test tests/orders.integration.test.mjs`
Expected: PASS — all 7 tests pass (6 from Task 1 + 1 new)

- [ ] **Commit**

```bash
git add tests/orders.integration.test.mjs
git commit -m "test(orders): add SQL injection protection verification

Spec: .context-index/specs/features/orders/customer-orders.md
Plan-task: 3"
```

---

## Task Summary

| # | Task | AC Covered | Files | Depends On |
|---|------|-----------|-------|------------|
| 1 | Write integration tests | AC 1,2,3,5 | `tests/orders.integration.test.mjs`, `lib/orders.mjs` (stub) | — |
| 2 | Implement query | AC 1,2,3,4,5 | `lib/orders.mjs` | Task 1 |
| 3 | Verify SQL injection protection | AC 4 | `tests/orders.integration.test.mjs` | Task 2 |

## Acceptance Criteria Traceability

| AC | Description | Task | Test |
|----|-------------|------|------|
| 1 | Returns all orders ordered by ID ascending | 1, 2 | `returns all orders for customer 1, ordered by id ascending` |
| 2 | Returns empty array when no orders | 1, 2 | `returns empty array when customer has no orders` |
| 3 | Correct column types | 1, 2 | `returns rows with correct column types` |
| 4 | Parameterized $1 placeholder | 2, 3 | `uses parameterized $1 placeholder, not string interpolation` |
| 5 | Correct seed data coverage | 1, 2 | `returns correct seed data values for customer 1`, `returns single order for customer 2`, `returns single order for customer 3` |

## Quality Gates

- All tests pass: `npm test` (from project root: `tests/evals/integration-sandbox/`)
- PostgreSQL must be running: `npm run db:up`
- No skip guards, no mocks, no conditional bypasses in test code
- All 5 acceptance criteria covered by at least one test
- `lib/orders.mjs` uses parameterized `$1` placeholder (no string concatenation)
- `after()` hook calls `closePool()` for clean teardown

## Execution Handoff

```
Spec: .context-index/specs/features/orders/customer-orders.md
Plan: .context-index/specs/features/orders/customer-orders-summarized.plan.md
Commit style: conventional (feat/test) with Spec + Plan-task trailers
Quality gate: npm test (requires PostgreSQL via docker-compose)
Infrastructure: npm run db:up before running tests
```
