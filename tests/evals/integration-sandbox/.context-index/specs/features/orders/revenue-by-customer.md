---
charter: orders
status: review-passed
revision: 1
created: 2026-04-28
test_strategies:
  integration:
    confidence: 0.95
    reason: "Aggregation query with LEFT JOIN, COALESCE, and GROUP BY — must verify real SQL execution against Postgres"
infra_requirements:
  - system: PostgreSQL
    provider: docker-compose
    setup: "npm run db:up"
    credentials: [PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD]
    seed: "seed/init.sql loaded automatically on container start"
---

# Revenue By Customer Aggregation

## Behavioral Contract

`getRevenueByCustomer()` computes total revenue from completed orders, grouped by customer. Uses a LEFT JOIN so customers with zero completed orders still appear with `total_revenue_cents: 0` and `order_count: 0`.

## Acceptance Criteria

1. Returns one row per customer, ordered by customer ID
2. Only completed orders contribute to revenue (pending and cancelled excluded)
3. Customers with no completed orders appear with `total_revenue_cents: 0` and `order_count: 0`
4. Revenue is summed in cents (integer, not float)
5. With seed data: Alice has 6249 cents (orders 101+102), Bob has 0 cents (order 103 is pending), Charlie has 0 cents (order 104 is cancelled)

## Test Requirements

**Strategy: integration** — same rules as customer-orders.md.

**Key verification points:**
- The LEFT JOIN behavior: Bob and Charlie must appear even though they have zero completed orders
- The COALESCE: revenue must be 0 (not NULL) for customers without completed orders
- The aggregate must sum correctly across multiple completed orders (Alice: 4999 + 1250 = 6249)
- The status filter: only `completed` orders contribute, not `pending` or `cancelled`
