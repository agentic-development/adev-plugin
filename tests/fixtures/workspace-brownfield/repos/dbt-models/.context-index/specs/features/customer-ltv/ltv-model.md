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
---

# Live Spec: LTV Model

## Behavioral Contract

### Preconditions

- The `orders` source table exists with columns: `customer_id` (string), `total_usd` (numeric), `created_at` (timestamp)
- dbt is configured with access to the analytics database

### Behaviors

1. **When** the `customer_ltv` model runs **then** it materializes a table with columns: `customer_id` (string, primary key), `ltv_usd` (numeric, non-negative), `computed_at` (timestamp UTC).

2. **When** computing LTV for a customer **then** `ltv_usd = SUM(total_usd)` across all their orders in the `orders` source table.

3. **When** a customer has no orders **then** they do not appear in `customer_ltv` (only customers with order history get a row).

4. **When** the model materializes **then** `computed_at` is set to the dbt run's invocation time in UTC.

5. **When** the model runs twice with the same source data **then** it produces identical output (idempotence).

### Postconditions

- `customer_ltv` table is available as `{{ ref('customer_ltv') }}` for downstream models
- Schema tests pass: `not_null(customer_id)`, `unique(customer_id)`, `accepted_range(ltv_usd, min=0)`

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| `orders` source table is missing | dbt fails with a clear error referencing the missing source |
| Negative `total_usd` in source data | Row is excluded with a warning (data quality flag) |

## Acceptance Criteria

- [ ] `customer_ltv` table has columns: `customer_id`, `ltv_usd`, `computed_at`
- [ ] Primary key `customer_id` is unique and non-null
- [ ] `ltv_usd` is always `>= 0`
- [ ] `computed_at` is UTC
- [ ] `dbt test` passes on schema tests
- [ ] Model runs idempotently (same output for same input)
- [ ] `dbt compile` succeeds
