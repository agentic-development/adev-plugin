# Live Spec: fct_orders Mart

## Overview

The fct_orders fact table documents order transactions at the order grain with payment method breakdown.

## Grain Statement

**Grain:** One row per order.
**Primary Key:** order_id (unique, not null)

## Behavioral Contract (When...Then)

1. **When** an order in stg_orders has no corresponding payments in the payment pipeline, **then** the fact table includes the order with NULL values in all payment columns (credit_card_amount, bank_transfer_amount, gift_card_amount, total_amount) due to the LEFT JOIN semantics.

2. **When** an order has multiple payment records split across different payment methods (e.g., $50 credit card + $30 gift card), **then** those amounts are aggregated by method, with each method column containing only its respective sum, and total_amount reflecting the sum across all methods.

3. **When** an order has payments, **then** the amounts are always in dollars (not cents), having been converted upstream by the cents_to_dollars macro (round(column / 100.0, 2)) at the stg_payments level before pivoting.

4. **When** a payment_method value exists that is not in {credit_card, bank_transfer, gift_card}, **then** the amount from that unknown method contributes to total_amount but NOT to any of the three named method columns, causing a potential mismatch where credit_card_amount + bank_transfer_amount + gift_card_amount < total_amount.

## Join Specification

**Join Type:** LEFT JOIN
**Left Table:** stg_orders (aliased as orders)
**Right Table:** int_orders_pivoted_to_payments (aliased as payments)
**Join Key:** orders.order_id = payments.order_id

### Fan-Out Risk Assessment
**Risk Level:** NONE. The int_orders_pivoted_to_payments model aggregates to one row per order_id via GROUP BY, ensuring 1:1 cardinality on the right side.

## Output Columns (In Sequence)

| Column | Source | Nullable | Description |
|--------|--------|----------|-------------|
| order_id | stg_orders | NOT NULL | Primary key |
| customer_id | stg_orders | NOT NULL | FK to dim_customers |
| order_date | stg_orders | NOT NULL | Order placement date, cast to DATE |
| order_status | stg_orders | NOT NULL | One of: placed, shipped, completed, returned |
| credit_card_amount | int_orders_pivoted_to_payments | YES | Credit card payments in dollars. NULL if no payments. |
| bank_transfer_amount | int_orders_pivoted_to_payments | YES | Bank transfer payments in dollars. NULL if no payments. |
| gift_card_amount | int_orders_pivoted_to_payments | YES | Gift card payments in dollars. NULL if no payments. |
| total_amount | int_orders_pivoted_to_payments | YES | Sum of all payments in dollars. NULL if no payments. |

## Upstream Dependencies

### Direct Dependencies
- **stg_orders** — via {{ ref('stg_orders') }}
- **int_orders_pivoted_to_payments** — via {{ ref('int_orders_pivoted_to_payments') }}

### Transitive Dependencies
- **stg_payments** feeds int_orders_pivoted_to_payments — provides raw payment records
- **raw_orders** upstream of stg_orders
- **raw_payments** upstream of stg_payments
- **cents_to_dollars macro** — applied in both staging models

## Acceptance Criteria

### Currently Tested
1. order_id unique and not_null
2. customer_id not_null, references dim_customers
3. order_date not_null
4. order_status not_null, accepted_values

### NOT Currently Tested
5. Row count parity: count(fct_orders) = count(stg_orders)
6. Column sum alignment: credit_card + bank_transfer + gift_card = total_amount (where not null)
7. Payment amounts non-negative
8. Conversion precision: all amounts rounded to 2 decimal places

## Error Cases

| Scenario | Behavior | Risk |
|---|---|---|
| Order with zero payments | NULL for all payment columns (LEFT JOIN) | Downstream must handle NULLs |
| Payment with no matching order | Silently dropped (LEFT JOIN left-side only) | Revenue lost from mart |
| Unknown payment method | Excluded from named columns, included in total_amount | Sum mismatch |
| Duplicate order_id in stg_orders | Fan-out on join | Mitigated by unique test |
| Negative amounts | Passed through | Could indicate refunds or errors |

## Order Total Discrepancy

**Important:** stg_orders computes an `order_total` column (from raw_orders.total_amount_cents via cents_to_dollars). However, fct_orders does NOT use this column. Instead, it uses `total_amount` from int_orders_pivoted_to_payments, which sums actual payments received. These may differ (e.g., partial payments, overpayments). The fact table prioritizes payment-of-record over order-of-record.

## Lineage Diagram

```
raw_orders          raw_payments
    |                    |
    v                    v
stg_orders          stg_payments
    |                    |
    |                    v
    |         int_orders_pivoted_to_payments
    |                    |
    +-----> LEFT JOIN <--+
                |
                v
           fct_orders
```
