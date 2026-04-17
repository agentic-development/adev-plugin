---
charter: customer-ltv
status: review-passed
revision: 1
created: 2026-04-16
updated: 2026-04-16
depends-on: ["@dbt-models/ltv-model"]
---

# Live Spec: LTV Endpoint

## Behavioral Contract

### Behaviors

1. **When** `GET /metrics/ltv/:customer_id` is called **then** the service queries the `customer_ltv` table and returns `{ customer_id, ltv_usd, computed_at }`.
2. **When** the customer is not found **then** return 404.
3. **When** the dbt model has not run yet **then** return 503.

## Acceptance Criteria

- [ ] Endpoint returns LTV for existing customers
- [ ] Returns 404 for unknown customers
- [ ] Returns 503 when `customer_ltv` table is missing or stale
- [ ] Response shape: `{ customer_id, ltv_usd, computed_at }`
