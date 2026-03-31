I'll debug this dbt test failure systematically. Let me start by reproducing the issue.

## Phase 1: Reproduce
Now let me check the upstream model:
The current data has no NULLs, but let me verify the LEFT JOIN behavior creates the potential for NULLs:
The current data is consistent (all orders have payments). The issue described in the prompt would occur with orphan orders. Let me verify the model's behavior by checking the LEFT JOIN logic:
## Diagnosis Complete

**Root Cause Identified**: The LEFT JOIN in `fct_orders.sql:20` produces NULLs for orders without payment records.

### Mechanism:
1. `int_orders_pivoted_to_payments` aggregates only orders that have payments (GROUP BY excludes orphans)
2. LEFT JOIN from `stg_orders` to this intermediate model returns NULL for any order_id not in the payments aggregate
3. When an order exists without corresponding payment, `total_amount` becomes NULL

### Current State:
Current data has 125 orders and 125 unique payment order_ids, so no NULLs exist now. The test failure indicates either:
- Some orders lost their payment records, or
- The scenario simulates an earlier data state

### Fix Options:

| Approach | Fix | When to Use |
|----------|-----|-------------|
| **Fix the model** | `COALESCE(payments.total_amount, 0)` | Orders without payments are valid business scenario |
| **Fix the data** | Investigate missing payment records | Orphan orders indicate data pipeline bug |

Which approach would you like me to implement?
