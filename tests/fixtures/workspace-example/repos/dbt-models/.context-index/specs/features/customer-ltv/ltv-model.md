---
charter: customer-ltv
status: review-passed
revision: 1
created: 2026-04-16
updated: 2026-04-16
---

# Live Spec: LTV Model

## Behavioral Contract

### Behaviors

1. **When** the dbt model runs **then** it computes `ltv_usd` per customer from the `orders` table using `SUM(total_usd)`.
2. **When** a customer has no orders **then** `ltv_usd = 0`.
3. **When** the model completes **then** `computed_at` is set to the run's UTC timestamp.

## Acceptance Criteria

- [ ] `customer_ltv` table materialized with columns: `customer_id`, `ltv_usd`, `computed_at`
- [ ] Customers with no orders have `ltv_usd = 0`
- [ ] `computed_at` is UTC
