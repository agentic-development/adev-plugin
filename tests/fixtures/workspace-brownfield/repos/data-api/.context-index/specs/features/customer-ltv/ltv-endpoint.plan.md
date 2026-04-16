# Implementation Plan: LTV Endpoint

> **Methodology:** adev
> **Workspace:** workspace-brownfield (data-api repo)
> **Charter:** ../../../../../../.context-index/specs/features/customer-ltv/charter.md (workspace-level)
> **Spec:** .context-index/specs/features/customer-ltv/ltv-endpoint.md
> **Review:** PASS_WITH_NOTES (2026-04-16)
> **Platform:** Node.js, JavaScript (ESM), Express, node:test, npm
> **Cross-repo dependency:** `@dbt-models/ltv-model` (referenced but not blocking)

**Goal:** Implement a read-only REST endpoint `GET /metrics/ltv/:customer_id` that serves customer LTV from the `customer_ltv` table, with validation, auth, and freshness/missing-table guards.

**Architecture:** Thin route handler in `src/routes/ltv.js` delegates to a service in `src/services/ltv-service.js`. The service performs a single query with a staleness join, returning normalized results. Input validation happens at the route layer via a middleware regex check. Error shape follows the constitution's `{ error: { code, message } }` convention.

**Workspace note:** The `customer_ltv` table schema is owned by `@dbt-models/ltv-model`. The columns consumed here (`customer_id`, `ltv_usd`, `computed_at`) are pinned to that spec. If the upstream schema changes, this plan must be re-reviewed.

---

## File Structure

**Create:**
- `src/routes/ltv.js` — route handler for `GET /metrics/ltv/:customer_id`
- `src/services/ltv-service.js` — query and staleness logic
- `src/middleware/validate-customer-id.js` — input validation middleware
- `tests/routes/ltv.test.mjs` — route unit tests
- `tests/services/ltv-service.test.mjs` — service unit tests
- `tests/integration/ltv-endpoint.test.mjs` — integration test with seeded data

**Modify:**
- `src/app.js` — register the new route
- (none from sibling repos — workspace rule)

**Reference (read, do not modify):**
- `@dbt-models/ltv-model` — upstream spec for schema contract
- `.context-index/constitution.md` — error shape, auth requirements

## Context Packets

### Task 1: validation middleware
- Spec: criterion "Endpoint returns 400 for invalid customer_id format"
- Constitution: "input validation at the boundary"

### Task 2: ltv-service
- Spec: behaviors 1, 3, 4
- Cross-repo: `@dbt-models/ltv-model` for column contract

### Task 3: route handler
- Spec: all behaviors
- Constitution: error shape `{ error: { code, message } }`

### Task 4: integration test
- Spec: all acceptance criteria
- Seed data: known customer with LTV, no-LTV customer, stale table

## Parallelization

- Group A: Task 1 (middleware) — independent
- Group B: Task 2 (service) — independent
- Group C: Task 3 (route) — depends on Task 1 + Task 2
- Group D: Task 4 (integration) — depends on Task 3

Groups A and B can run in parallel. C waits for both. D is last.

---

### Task 1: Input Validation Middleware [specialist: none]

**Charter capability:** LTV Endpoint
**Files:**
- Create: `src/middleware/validate-customer-id.js`
- Test: `tests/middleware/validate-customer-id.test.mjs`

**Tests:** `tests/middleware/validate-customer-id.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateCustomerId } from "../../src/middleware/validate-customer-id.js";

describe("validateCustomerId", () => {
  it("passes valid IDs", () => {
    const req = { params: { customer_id: "cust_123" } };
    const res = { status: () => res, json: () => res };
    let nextCalled = false;
    validateCustomerId(req, res, () => { nextCalled = true; });
    assert.ok(nextCalled);
  });

  it("rejects IDs with special characters", () => {
    const req = { params: { customer_id: "cust<script>" } };
    let statusCode, body;
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: (b) => { body = b; return res; },
    };
    validateCustomerId(req, res, () => {});
    assert.equal(statusCode, 400);
    assert.equal(body.error.code, "INVALID_INPUT");
  });

  it("rejects IDs longer than 64 chars", () => {
    const req = { params: { customer_id: "a".repeat(65) } };
    let statusCode;
    const res = { status: (c) => { statusCode = c; return res; }, json: () => res };
    validateCustomerId(req, res, () => {});
    assert.equal(statusCode, 400);
  });
});
```

- [ ] **Verify test fails** — `node --test tests/middleware/validate-customer-id.test.mjs` fails because the module doesn't exist

- [ ] **Implement**

```javascript
// src/middleware/validate-customer-id.js
const CUSTOMER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function validateCustomerId(req, res, next) {
  const id = req.params.customer_id;
  if (!CUSTOMER_ID_PATTERN.test(id)) {
    return res.status(400).json({
      error: { code: "INVALID_INPUT", message: "customer_id format invalid" }
    });
  }
  next();
}
```

- [ ] **Verify test passes**

- [ ] **Commit**

```bash
git add src/middleware/validate-customer-id.js tests/middleware/validate-customer-id.test.mjs
git commit -m "feat(api): add customer_id validation middleware"
```

---

### Task 2: LTV Service [specialist: none]

**Charter capability:** LTV Endpoint
**Files:**
- Create: `src/services/ltv-service.js`
- Test: `tests/services/ltv-service.test.mjs`

**Tests:** `tests/services/ltv-service.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { getCustomerLtv, LtvStatus } from "../../src/services/ltv-service.js";

describe("getCustomerLtv", () => {
  it("returns OK with LTV row for existing customer", async () => {
    const db = {
      query: mock.fn(async () => [{
        customer_id: "c1", ltv_usd: 100, computed_at: new Date().toISOString(), is_stale: false
      }]),
      tableExists: mock.fn(async () => true),
    };
    const result = await getCustomerLtv(db, "c1");
    assert.equal(result.status, LtvStatus.OK);
    assert.equal(result.data.ltv_usd, 100);
  });

  it("returns NOT_FOUND when customer missing", async () => {
    const db = { query: mock.fn(async () => []), tableExists: mock.fn(async () => true) };
    const result = await getCustomerLtv(db, "c1");
    assert.equal(result.status, LtvStatus.NOT_FOUND);
  });

  it("returns TABLE_MISSING when customer_ltv table absent", async () => {
    const db = { tableExists: mock.fn(async () => false), query: mock.fn() };
    const result = await getCustomerLtv(db, "c1");
    assert.equal(result.status, LtvStatus.TABLE_MISSING);
  });

  it("returns STALE when data older than 48h", async () => {
    const old = new Date(Date.now() - 49 * 3600 * 1000).toISOString();
    const db = {
      query: mock.fn(async () => [{ customer_id: "c1", ltv_usd: 50, computed_at: old, is_stale: true }]),
      tableExists: mock.fn(async () => true),
    };
    const result = await getCustomerLtv(db, "c1");
    assert.equal(result.status, LtvStatus.STALE);
  });
});
```

- [ ] **Verify test fails**

- [ ] **Implement**

```javascript
// src/services/ltv-service.js
export const LtvStatus = Object.freeze({
  OK: "OK",
  NOT_FOUND: "NOT_FOUND",
  TABLE_MISSING: "TABLE_MISSING",
  STALE: "STALE",
});

const STALE_HOURS = 48;

export async function getCustomerLtv(db, customerId) {
  if (!(await db.tableExists("customer_ltv"))) {
    return { status: LtvStatus.TABLE_MISSING };
  }

  const rows = await db.query(
    `SELECT customer_id, ltv_usd, computed_at,
            (EXTRACT(EPOCH FROM (NOW() - computed_at)) > ${STALE_HOURS * 3600}) AS is_stale
     FROM customer_ltv WHERE customer_id = $1`,
    [customerId]
  );

  if (rows.length === 0) return { status: LtvStatus.NOT_FOUND };
  if (rows[0].is_stale) return { status: LtvStatus.STALE };
  return { status: LtvStatus.OK, data: { customer_id: rows[0].customer_id, ltv_usd: rows[0].ltv_usd, computed_at: rows[0].computed_at } };
}
```

- [ ] **Verify test passes**

- [ ] **Commit**

```bash
git add src/services/ltv-service.js tests/services/ltv-service.test.mjs
git commit -m "feat(api): add ltv service with freshness and missing-table handling"
```

---

### Task 3: Route Handler [specialist: none]

**Charter capability:** LTV Endpoint
**Depends on:** Task 1, Task 2
**Files:**
- Create: `src/routes/ltv.js`
- Modify: `src/app.js` — register the route with auth + validation middleware
- Test: `tests/routes/ltv.test.mjs`

**Tests:** `tests/routes/ltv.test.mjs`

- [ ] **Write failing test**

Covers all 5 HTTP status paths (200, 400, 401, 404, 503 x2) using a mock service and the route handler in isolation.

- [ ] **Verify test fails**

- [ ] **Implement**

```javascript
// src/routes/ltv.js
import { getCustomerLtv, LtvStatus } from "../services/ltv-service.js";

export function registerLtvRoute(app, db, authMiddleware, validateMiddleware) {
  app.get("/metrics/ltv/:customer_id", authMiddleware, validateMiddleware, async (req, res) => {
    const result = await getCustomerLtv(db, req.params.customer_id);
    switch (result.status) {
      case LtvStatus.OK: return res.status(200).json(result.data);
      case LtvStatus.NOT_FOUND: return res.status(404).json({ error: { code: "NOT_FOUND", message: "Customer LTV not found" } });
      case LtvStatus.TABLE_MISSING: return res.status(503).json({ error: { code: "TABLE_MISSING", message: "customer_ltv table is not available" } });
      case LtvStatus.STALE: return res.status(503).json({ error: { code: "STALE", message: "customer_ltv data is stale (>48h)" } });
      default: return res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected state" } });
    }
  });
}
```

- [ ] **Verify test passes**

- [ ] **Commit**

```bash
git add src/routes/ltv.js src/app.js tests/routes/ltv.test.mjs
git commit -m "feat(api): add GET /metrics/ltv/:customer_id endpoint"
```

---

### Task 4: Integration Test [specialist: none]

**Charter capability:** LTV Endpoint (quality gate)
**Depends on:** Task 3
**Files:**
- Create: `tests/integration/ltv-endpoint.test.mjs`
- Create: `tests/fixtures/seed-ltv.sql` — seed data: one customer with LTV, one stale table scenario

**Tests:** `tests/integration/ltv-endpoint.test.mjs`

- [ ] **Write failing integration test** — seeds a test DB with known `customer_ltv` rows, spins up the app, hits the endpoint, verifies all 5 response codes.

- [ ] **Verify test fails** (the fixtures don't exist yet)

- [ ] **Implement** — create seed file and test harness. Test runs against a local Postgres container or SQLite shim depending on env.

- [ ] **Verify test passes**

- [ ] **Commit**

```bash
git add tests/integration/ltv-endpoint.test.mjs tests/fixtures/seed-ltv.sql
git commit -m "test(api): add integration test for ltv endpoint"
```

---

## Quality Gates

After all tasks are complete:

- [ ] Tests pass: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] All 10 acceptance criteria from spec satisfied
- [ ] Cross-repo dependency `@dbt-models/ltv-model` is still in a compatible status (watch for upstream schema changes)

---

## Workspace Notes

This plan was generated with workspace context:

- Workspace root: `tests/fixtures/workspace-brownfield/`
- Current repo: `data-api`
- Sibling repos readable (read-only): `dbt-models`, `airflow-dags`
- Cross-repo dependency: `@dbt-models/ltv-model` (resolved, status: draft — warning, not blocker)
