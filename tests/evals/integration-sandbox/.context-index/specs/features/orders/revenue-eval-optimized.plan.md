---
spec: revenue-by-customer.md
charter: orders
status: ready
created: 2026-05-03
revision: 1
---

# Implementation Plan: Revenue By Customer Aggregation

## Overview

Implement `getRevenueByCustomer()` in `lib/orders.mjs` and its integration test in `tests/revenue-by-customer.test.mjs`.

## Tasks

### Task 1 — Implement `getRevenueByCustomer()` in `lib/orders.mjs`

**Spec:** `revenue-by-customer.md`  
**Type:** implementation  
**Blast radius:** low (additive, new export only)

**Acceptance criteria:**
- Returns one row per customer ordered by `customer_id` ASC
- LEFT JOIN ensures customers with zero completed orders are included
- COALESCE converts NULL revenue to 0 for customers with no completed orders
- Status filter restricts aggregation to `status = 'completed'`
- Revenue summed as integer cents

**Expected SQL shape:**
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

**Return shape (per row):**
```js
{ customer_id, name, total_revenue_cents, order_count }
```

**Files modified:** `lib/orders.mjs`

---

### Task 2 — Write integration test in `tests/revenue-by-customer.test.mjs`

**Spec:** `revenue-by-customer.md`  
**Type:** test (integration)  
**Blast radius:** low (new test file only)  
**Depends on:** Task 1

**Test strategy:** integration — real PostgreSQL, no mocking, seed data from `seed/init.sql`

**Key assertions (seed-data-grounded):**

| Customer | Expected `total_revenue_cents` | Expected `order_count` |
|----------|-------------------------------|------------------------|
| Alice    | 6249                          | 2                      |
| Bob      | 0                             | 0                      |
| Charlie  | 0                             | 0                      |

**Verification points:**
1. Result length equals 3 (all customers returned)
2. Alice: `total_revenue_cents = 6249`, `order_count = 2` (orders 101+102: 4999+1250)
3. Bob: `total_revenue_cents = 0`, `order_count = 0` (order 103 is pending — excluded)
4. Charlie: `total_revenue_cents = 0`, `order_count = 0` (order 104 is cancelled — excluded)
5. Revenue values are integers (not floats, not null)
6. Result is ordered by `customer_id` ASC

**Infrastructure requirement:** PostgreSQL via docker-compose (`npm run db:up`)

**Files created:** `tests/revenue-by-customer.test.mjs`

---

## Execution Order

```
Task 1 → Task 2
```

Sequential — test must compile against the implemented function.

## Quality Gate

```bash
npm test
```

All existing tests must continue to pass. New integration test must connect to real PostgreSQL and fail hard if database is unavailable (no skipping).
