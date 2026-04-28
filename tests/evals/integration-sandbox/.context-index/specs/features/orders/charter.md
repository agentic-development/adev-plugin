# Orders Module Charter

## Purpose

Order management: querying, creating, and aggregating orders against a PostgreSQL database.

## Capability Map

| # | Capability | Spec | Status |
|---|-----------|------|--------|
| 1 | Query orders by customer | customer-orders.md | draft |
| 2 | Revenue aggregation | revenue-by-customer.md | draft |

## Domain Model

- **Customer**: id, name, email
- **Order**: id, customer_id, total_cents, status, created_at
- Relationship: Customer 1:N Orders
- Statuses: pending, completed, cancelled

## Dependencies

- PostgreSQL (via `pg` package)
- Seed data in `seed/init.sql`
