---
charter: orders
kind: behavioral
status: validated
risk_level: medium
milestone: v1
revision: 2
charter-revision: 2
created: 2026-07-03
updated: 2026-07-28
---

# Live Spec: Validate and price an order payload

> Fixture content for the skill-regression eval suite.
> Parent charter: `.context-index/specs/features/orders/charter.md`

`createOrder(payload)` is the only function that turns untrusted order input
into a priced order record. It performs no I/O, reads no clock, and generates
no randomness, so the same payload always yields the same record.

## Behavioral Contract

### Preconditions

- `payload` is a plain object. An array, `null`, or a primitive is a *shape*
  violation, not a field violation.
- All monetary inputs are integer minor units (cents). No float is accepted
  anywhere in the payload.

### Behaviors

**B1 — Prices a valid payload.** When `payload` carries a non-empty
`customerId`, a valid `currency`, and one to `MAX_LINE_ITEMS` valid line items,
then `createOrder` returns `{ ok: true, order }`, where each entry of
`order.items` carries `lineTotalCents = quantity * unitPriceCents`,
`order.subtotalCents` is the sum of those line totals, and
`order.totalCents = subtotalCents - discountCents`.

**B2 — Defaults the discount.** When `discountCents` is absent, then it is
treated as `0` and appears as `0` on the returned record.

**B3 — Throws only on a malformed shape.** When `payload` is `null`, an array,
or a non-object, then `createOrder` throws `TypeError`. No other input throws.

**B4 — Collects every field problem.** When one or more fields are invalid,
then `createOrder` returns `{ ok: false, errors }` with one entry per distinct
problem — validation does not short-circuit on the first failure.

**B5 — Names the offending line item by index.** When a line item is invalid,
then its message is prefixed `items[<index>].`, so a caller can map a message
back to a position in the submitted array.

**B6 — Bounds the item count.** When `items.length` exceeds `MAX_LINE_ITEMS`,
then the order is rejected with exactly that one error, and no per-item
messages are produced for the oversized array.

**B7 — Bounds the discount by the subtotal.** When `discountCents` exceeds the
computed subtotal, then the order is rejected with
`discountCents must not exceed the subtotal`. This is a business rule checked
after pricing, so it is reported alone rather than alongside field errors.

### Postconditions

- A returned record is a fresh object; the input `payload` is never mutated.
- `order.totalCents` is a non-negative integer.
- `order.items.length` equals the submitted `items.length`.
- On a rejection, `errors` is a non-empty array of strings and no `order` key
  is present.

### Error Cases

| Condition | Result |
|---|---|
| `payload` is not a plain object | throws `TypeError` |
| `customerId` missing, non-string, or blank | `customerId must be a non-empty string` |
| `currency` not three uppercase letters | `currency must be a three-letter uppercase ISO 4217 code` |
| `items` absent or empty | `items must be a non-empty array` |
| `items.length > MAX_LINE_ITEMS` | `items must hold at most 50 line items` |
| line item not an object | `items[i] must be an object` |
| `sku` missing, non-string, or blank | `items[i].sku must be a non-empty string` |
| `quantity` not a positive integer | `items[i].quantity must be a positive integer` |
| `unitPriceCents` negative or non-integer | `items[i].unitPriceCents must be a non-negative integer` |
| `discountCents` negative or non-integer | `discountCents must be a non-negative integer` |
| `discountCents` above the subtotal | `discountCents must not exceed the subtotal` |

## Test Expectations

`tests/create-order.test.mjs` covers B1 through B7, one `node:test` case per
behavior, with `MAX_LINE_ITEMS` read from the module rather than hardcoded.

## Traceability

| Artifact | Path |
|---|---|
| Implementation | `src/orders/create-order.mjs` |
| Public re-export | `src/index.mjs` |
| Tests | `tests/create-order.test.mjs` |
| API reference | `docs/api.md` |
| Plan | `.context-index/specs/features/orders/create-order.plan.md` |
| Golden sample | `.context-index/samples/order-pipeline-create-order.md` |
