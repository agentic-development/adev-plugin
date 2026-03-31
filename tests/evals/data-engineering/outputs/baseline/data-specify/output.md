# Live Spec: `fct_orders`

**Model:** `models/marts/fct_orders.sql`
**Type:** Fact table
**Grain:** One row per **order** (`order_id` is the primary key)

---

## 1. Upstream Dependencies

| Dependency | Type | Resolved via |
|---|---|---|
| `stg_orders` | Staging model | `{{ ref('stg_orders') }}` |
| `int_orders_pivoted_to_payments` | Intermediate model | `{{ ref('int_orders_pivoted_to_payments') }}` |

Transitive sources:
- `stg_orders` <- `raw_orders` (via `ref('raw_orders')`)
- `stg_payments` (feeds `int_orders_pivoted_to_payments`) <- `raw_payments`

Macro dependency: `cents_to_dollars` -- `round(column / 100.0, 2)` applied in staging models.

---

## 2. Behavioral Contract (When...Then)

**W1 -- Order exists with matching payments:**
When an order in `stg_orders` has a matching `order_id` in `int_orders_pivoted_to_payments`, then the output row contains order attributes and payment-method-level amounts.

**W2 -- Order exists with no payments (orphan order):**
When an order has no matching `order_id` in `int_orders_pivoted_to_payments` (LEFT JOIN), then all payment amount columns are NULL.

**W3 -- Payment exists with no matching order:**
When a payment record exists but has no corresponding `order_id` in `stg_orders`, then that payment is excluded (LEFT JOIN preserves left side only).

**W4 -- Multiple payment methods for a single order:**
When an order has payments across multiple methods, the intermediate model pre-aggregates them via conditional SUM, and `fct_orders` receives one row with each method's total.

**W5 -- Currency conversion:**
When raw amounts are stored in cents, the `cents_to_dollars` macro converts them upstream before they reach the mart layer.

---

## 3. Join Logic

```
stg_orders  LEFT JOIN  int_orders_pivoted_to_payments
            ON orders.order_id = payments.order_id
```

- **Join type:** LEFT JOIN -- every order appears even with zero payments
- **Join key:** `order_id` (unique on both sides)
- **Fan-out risk:** None. Intermediate model aggregates to one row per `order_id`

---

## 4. Output Columns

| Column | Source | Description |
|---|---|---|
| `order_id` | `stg_orders` | Primary key. Unique, not null. |
| `customer_id` | `stg_orders` | FK to `dim_customers`. Not null. |
| `order_date` | `stg_orders` | Date order was placed. Cast to DATE. |
| `order_status` | `stg_orders` | One of: placed, shipped, completed, returned. |
| `credit_card_amount` | `int_orders_pivoted_to_payments` | Total paid via credit card, in dollars. NULL if no payments. |
| `bank_transfer_amount` | `int_orders_pivoted_to_payments` | Total paid via bank transfer, in dollars. NULL if no payments. |
| `gift_card_amount` | `int_orders_pivoted_to_payments` | Total paid via gift card, in dollars. NULL if no payments. |
| `total_amount` | `int_orders_pivoted_to_payments` | Sum of all payments, in dollars. NULL if no payments. |

---

## 5. Acceptance Criteria

| ID | Criterion | Tested? |
|---|---|---|
| AC-1 | `order_id` is unique | Yes (unique test) |
| AC-2 | `order_id` is never NULL | Yes (not_null test) |
| AC-3 | `customer_id` is never NULL | Yes (not_null test) |
| AC-4 | `customer_id` references valid `dim_customers` row | Yes (relationships test) |
| AC-5 | `order_status` is one of placed/shipped/completed/returned | Yes (accepted_values test) |
| AC-6 | Row count equals `stg_orders` row count | **Untested** |
| AC-7 | `total_amount = credit_card + bank_transfer + gift_card` when payments exist | **Untested** |
| AC-8 | Payment amounts are non-negative when present | **Untested** |

---

## 6. Error Cases

| Scenario | Current Behavior | Risk |
|---|---|---|
| Order with zero payments | NULL for all payment columns | Downstream must handle NULLs |
| Payment with no matching order | Silently dropped | Revenue lost from mart |
| Unknown payment method | Excluded from named columns but included in total_amount | Column sum != total_amount |
| Duplicate order_id in stg_orders | Fan-out on join | Mitigated by unique test |
| Negative amounts | Passed through | Could indicate refunds or errors |

---

## 7. Lineage Diagram

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
