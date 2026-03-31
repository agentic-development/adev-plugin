Let me read the context files and the target source code:
No Feature Charter exists yet. According to the skill prerequisites, I need a charter before creating a spec. Let me create a minimal charter for the orders module first.
**Extracted spec:** `.context-index/specs/features/orders/fct-orders.md`

**Stats:**
- Extracted from: 4 files (79 lines analyzed)
- Behaviors documented: 4
- Error cases: N/A (table covers edge cases)
- Coverage gaps: 4
- Constitutional violations: 1 (testing requirement)

The spec documents:
- **Grain**: One row per order
- **LEFT JOIN**: Explicitly identified as a design decision with implications (NULLs for orders without payments)
- **Column semantics**: All amounts in dollars (converted from cents via `cents_to_dollars` macro)
- **Edge cases**: Orders with no payments → NULL amounts, unrecognized payment methods → 0

**Next steps:**
- Review the spec at `.context-index/specs/features/orders/fct-orders.md`
- Add tests to address coverage gaps (orders without payments, payment sum validation)
- Run `dbt test` to verify

---
## Generated File: .context-index/specs/features/orders/fct-orders.md

---
charter: orders
status: review-pending
created: 2026-03-31
mode: extract
extracted-from:
  - models/marts/fct_orders.sql
  - models/staging/stg_orders.sql
  - models/intermediate/int_orders_pivoted_to_payments.sql
  - models/staging/stg_payments.sql
---

# fct_orders — Order-Grain Fact Table

## Behavioral Contract

<!-- Extracted from existing code. Describes current behavior as of 2026-03-31. -->

This model produces a fact table at order grain by joining order data with pivoted payment amounts broken down by payment method.

| Source | Role |
|--------|------|
| `stg_orders` | Provides one row per order with customer, date, status, and total |
| `int_orders_pivoted_to_payments` | Provides aggregated payment amounts per order, pivoted by method |

The model uses a LEFT JOIN from orders to payments, meaning every order appears regardless of whether it has associated payments.

## Behaviors

**When** an order exists in `stg_orders` **then** the order appears in `fct_orders` with all its base fields (order_id, customer_id, order_date, order_status).

**When** an order has associated payments in `stg_payments` **then** the payment amounts are aggregated and pivoted into separate columns (credit_card_amount, bank_transfer_amount, gift_card_amount, total_amount).

**When** an order has no associated payments **then** the payment amount columns are NULL (due to LEFT JOIN behavior).

**When** payments of multiple methods exist for an order **then** each payment method's amount is summed separately using conditional aggregation.

## Column Semantics

| Column | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| order_id | stg_orders.order_id | string | Primary key |
| customer_id | stg_orders.customer_id | string | Foreign key to dim_customers |
| order_date | stg_orders.order_date | date | Date when order was placed |
| order_status | stg_orders.order_status | string | Order lifecycle status |
| credit_card_amount | int_orders_pivoted_to_payments | numeric | Sum of credit card payments in dollars |
| bank_transfer_amount | int_orders_pivoted_to_payments | numeric | Sum of bank transfer payments in dollars |
| gift_card_amount | int_orders_pivoted_to_payments | numeric | Sum of gift card payments in dollars |
| total_amount | int_orders_pivoted_to_payments | numeric | Sum of all payment amounts in dollars |

**Note on units:** The `stg_payments` model applies the `cents_to_dollars` macro to convert cent values to dollars. Therefore, the payment amount columns in `fct_orders` are expressed in dollars, not cents.

## Edge Cases

| Condition | Observed Behavior | Status |
|-----------|-------------------|--------|
| Order with no payments | Payment columns are NULL | Expected (LEFT JOIN) |
| Order with multiple payments of same method | Amounts summed via GROUP BY | Expected |
| Order with multiple payment methods | Each method's amount aggregated separately | Expected |
| Order with payment in unrecognized method | Method not in pivot, amount = 0 | Expected (case returns 0) |

## Coverage Gaps

- No test verifying LEFT JOIN produces NULL for orders without payments
- No test validating total_amount = sum of individual payment method amounts
- No test confirming cent-to-dollar conversion accuracy
- No test for orders with missing or NULL order_status

## Constitution Reference

- **Dimensional Modeling**: ✓ Compliant — Clear fact/dimension separation, follows Kimball methodology
- **Testing Required**: ⚠ VIOLATION — No generic tests found for fct_orders model
- **No Duplicate Logic**: ✓ Compliant — Reuses intermediate layer model for payment pivoting

## Acceptance Criteria

- [x] One row per order from stg_orders
- [x] LEFT JOIN preserves all orders even without payments
- [x] Payment amounts correctly pivoted by method
- [x] Column values in dollars (not cents)
- [ ] Test exists for orders-without-payments → NULL behavior
- [ ] Test exists for payment amount sum correctness
- [ ] dbt test passes on fct_orders