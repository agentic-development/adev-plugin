# Validation Report: Customer Orders Query

> **Date:** 2026-05-03
> **Spec:** .context-index/specs/features/orders/customer-orders.md
> **Plan:** N/A
> **Overall Status:** FAIL

---

## Check 1: Quality Gates — SKIP

No `governance/gates.yaml` found. Quality gates are not configured. Run `/adev:init` to set up gates.

Note: `npm test` was run manually — 14 tests fail with ECONNREFUSED (PostgreSQL offline), 0 pass, 1 suite skipped via skip guard. The s9-baseline and s9-summarized suites fail hard (correct behavior). The `orders.integration.test.mjs` suite skips (prohibited behavior — see Checks 2 and 4).

## Check 1.5: Source Manifest Verification — SKIP

No source manifest found in spec frontmatter. Run /adev:implement to stamp one.

## Check 1.6: Code-Side Drift Warning — SKIP

Drift check skipped — no drift frontmatter in spec. `lib/spec-drift.mjs` not available.

## Check 2: Spec Compliance — FAIL

- **Criterion 1** (Returns all orders for a customer, ordered by ID ascending): PASS
  - `lib/orders.mjs:10` — query uses `ORDER BY id` and `WHERE customer_id = $1`
  - Test at `tests/orders.integration.test.mjs:23-28` asserts 2 rows with ids 101, 102

- **Criterion 2** (Returns empty array when customer has no orders): PASS
  - `lib/orders.mjs:7-13` — returns `rows` directly (empty array when no match)
  - Test at `tests/orders.integration.test.mjs:70-73` asserts `deepStrictEqual(rows, [])`

- **Criterion 3** (Returns rows with correct column types): PASS
  - `lib/orders.mjs:10` — SELECT specifies all typed columns explicitly
  - Test at `tests/orders.integration.test.mjs:36-44` with strict type assertions (`typeof`, `instanceof Date`)

- **Criterion 4** (Query uses parameterized $1 placeholder): PASS
  - `lib/orders.mjs:10-11` — query string contains `$1`, parameter passed as `[customerId]` array. No string concatenation.

- **Criterion 5** (Works correctly with deterministic seed data): PASS
  - Tests at lines 46-68 assert exact seed values: customer 1 has orders 101 (4999 cents, completed) and 102 (1250 cents, completed); customer 2 has order 103 (7500 cents, pending); customer 3 has order 104 (0 cents, cancelled). Matches `seed/init.sql:25-29`.

- **Test Integrity**: FAIL
  - `tests/orders.integration.test.mjs:8-16` — **Skip guard detected.** A try/catch block tests PostgreSQL connectivity and sets `canConnect = false` if unreachable. Line 18 uses `{ skip: !canConnect && 'PostgreSQL is not available — skipping integration tests' }` to conditionally skip the entire describe block.
  - This directly violates the spec's **Prohibited patterns**: _"Skipping tests when infrastructure is unavailable (`describe.skip`, `describe.skipIf`, `process.exit`). The agent must never add skip guards — only the user can decide to skip integration tests."_
  - The spec's **Test Requirements** state: _"If the database is not running, the test fails with a connection error (e.g., ECONNREFUSED). This is the correct behavior — a test that cannot reach its infrastructure is a failing test, not a skipped test."_

## Check 3: Charter Consistency — PASS

- **Scope:** Implementation is limited to `getOrdersByCustomer` in `lib/orders.mjs` — within charter capability #1 ("Query orders by customer"). The file also contains `getRevenueByCustomer` and `createOrder`, but those are for other capabilities and are not introduced by this spec.
- **Domain model:** Order entity matches charter definition: id, customer_id, total_cents, status, created_at. Customer→Order relationship is 1:N as specified. Statuses in seed data (completed, pending, cancelled) match charter's enumerated statuses.
- **Interface contracts:** Function signature `getOrdersByCustomer(customerId)` and return shape (array of order row objects) align with charter expectations.

## Check 4: Constitution Compliance — FAIL

- **Architecture boundaries:** PASS — Files are in correct locations: `lib/db.mjs` (connection pool), `lib/orders.mjs` (order queries), `tests/orders.integration.test.mjs` (tests), `seed/init.sql` (schema + seed data).
- **Non-negotiable principles:** FAIL
  - **Principle 1** ("Real database tests"): PASS — test file imports `getPool`, `closePool` from `lib/db.mjs` and calls `getOrdersByCustomer` which executes real SQL.
  - **Principle 2** ("Fail hard when infrastructure is offline"): **FAIL** — `tests/orders.integration.test.mjs:8-18` implements a connectivity check + skip guard that bypasses test execution when PostgreSQL is unreachable. The constitution states: _"Tests must never skip, guard, or bypass when infrastructure is unavailable. Only the user can decide to skip tests."_
  - **Principle 3** ("Deterministic seed data"): PASS — all assertions use exact values from `seed/init.sql`.
  - **Principle 4** ("Pure ESM"): PASS — all files are `.mjs`, `package.json` has `"type": "module"`.
  - **Principle 5** ("Clean teardown"): PASS — `after()` hook calls `closePool()` at line 19-21.
- **Coding standards:** PASS

## Check 5: ADR Compliance — N/A

No ADRs found in `.context-index/adrs/`.

## Check 6: Cross-Cutting Specs — N/A

No cross-cutting specs found in `.context-index/specs/cross-cutting/`.

## Check 7: Specialist Review — SKIPPED

No specialists registered in `manifest.yaml`.

## Check 8: Boundary Compliance — SKIP

No governance directory configured.

## Check 9: Transition Gates — SKIP

No `governance/gates.yaml` — no transitions configured.

## Check 10: Platform Drift — SKIP

No `platform-context.yaml` found. Platform drift check not applicable.

## Check 11: Visual Verification — N/A

No UI files in the implementation.

## Check 12: Lifecycle Reconciliation — SKIP

Task backend is configured (`file`) but `tasks.md` not found at `.context-index/tasks/tasks.md`. SKIP: task board unavailable for reconciliation.

## Check 13: Success Heuristic Extraction — SKIP

SKIP: non-PASS result.

---

**Summary:** 2 passed, 2 failed, 8 skipped/N/A checks.

**Failed checks:**
- **Check 2 (Spec Compliance):** Test file contains a prohibited skip guard pattern at `tests/orders.integration.test.mjs:8-18` — tests skip instead of failing when PostgreSQL is offline.
- **Check 4 (Constitution Compliance):** Non-negotiable Principle 2 violated — the same skip guard contradicts "Tests must never skip, guard, or bypass when infrastructure is unavailable."
