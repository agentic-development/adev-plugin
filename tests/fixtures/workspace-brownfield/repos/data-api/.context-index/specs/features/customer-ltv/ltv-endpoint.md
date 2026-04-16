---
charter: customer-ltv
status: draft
risk_level: low
revision: 1
charter-revision: 2
milestone: v1
created: 2026-04-16
updated: 2026-04-16
workspace-charter: ../../../../../.context-index/specs/features/customer-ltv/charter.md
depends-on: ["@dbt-models/ltv-model"]
---

# Live Spec: LTV Endpoint

## Behavioral Contract

### Preconditions

- The `customer_ltv` table exists in the analytics database (produced by the `@dbt-models/ltv-model` spec)
- The API has read-only credentials for the analytics database
- Requests carry a valid authentication token (per the data-api constitution)

### Behaviors

1. **When** `GET /metrics/ltv/:customer_id` is called with a valid auth token **then** the endpoint queries `customer_ltv` for the customer_id and returns `{ customer_id, ltv_usd, computed_at }` with HTTP 200.

2. **When** the customer_id is not found in `customer_ltv` **then** the endpoint returns HTTP 404 with `{ error: { code: "NOT_FOUND", message: "Customer LTV not found" } }`.

3. **When** the `customer_ltv` table is missing from the database **then** the endpoint returns HTTP 503 with `{ error: { code: "TABLE_MISSING", message: "customer_ltv table is not available" } }`.

4. **When** the `customer_ltv` table exists but its most recent `computed_at` is older than 48 hours **then** the endpoint returns HTTP 503 with `{ error: { code: "STALE", message: "customer_ltv data is stale (>48h)" } }`.

5. **When** the request lacks a valid auth token **then** the endpoint returns HTTP 401 (handled by existing auth middleware).

6. **When** customer_id contains invalid characters (not matching `^[a-zA-Z0-9_-]{1,64}$`) **then** the endpoint returns HTTP 400 with `{ error: { code: "INVALID_INPUT", message: "customer_id format invalid" } }`.

### Postconditions

- Successful responses never expose internal database errors
- Staleness check uses a single aggregated query, not per-request scans

### Error Cases

| Condition | HTTP Status | Error Code |
|-----------|-------------|------------|
| Valid customer found | 200 | — |
| Customer not found | 404 | NOT_FOUND |
| Table missing | 503 | TABLE_MISSING |
| Table stale (>48h) | 503 | STALE |
| Missing/invalid auth | 401 | (middleware) |
| Invalid customer_id format | 400 | INVALID_INPUT |

## Acceptance Criteria

- [ ] Endpoint returns 200 with LTV for existing customers
- [ ] Endpoint returns 404 for unknown customers
- [ ] Endpoint returns 503 when `customer_ltv` table is missing
- [ ] Endpoint returns 503 when data is stale (>48h)
- [ ] Endpoint returns 401 for unauthenticated requests
- [ ] Endpoint returns 400 for invalid customer_id format
- [ ] Response shape: `{ customer_id, ltv_usd, computed_at }` on success
- [ ] Error shape: `{ error: { code, message } }` on failure
- [ ] Unit tests cover all status code paths
- [ ] Integration test verifies end-to-end behavior against a seeded table
