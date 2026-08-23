---
kind: feature
status: approved
revision: 2
created: 2026-07-02
updated: 2026-07-28
---

# Feature Charter: orders

> Fixture content for the skill-regression eval suite. The `orders` module of a
> fictional Node.js library.

## Business Intent

Order intake is the single point where a customer's basket becomes a priced,
persistable record. Centralizing validation and pricing here means every entry
point charges the same amount for the same basket, and a pricing rule changes
in one place.

## Scope and Boundaries

### In Scope

- Structural and field-level validation of a raw order payload.
- Line-item pricing and order totalling in integer minor units.
- Order-level discount application, bounded by the subtotal.
- Order id minting for accepted orders.

### Out of Scope

- Shipping rate calculation — owned by the `shipping` module.
- Tax, duty, and currency conversion.
- Persistence and transport.

### Dependencies

| Dependency | Type | Description |
|---|---|---|
| `nanoid` | external library | URL-safe id generation for `newOrderId()` |
| `shipping` | internal module | Consumes an accepted order; `orders` does not depend on it |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| Order payload | Untrusted input from a caller | `customerId`, `currency`, `items`, `discountCents` |
| Line item | One SKU at one quantity and price | `sku`, `quantity`, `unitPriceCents` |
| Order record | Normalized, priced result | `items[].lineTotalCents`, `subtotalCents`, `discountCents`, `totalCents` |

### Relationships

An order payload holds one to `MAX_LINE_ITEMS` line items. A successful
`createOrder` call maps each line item to a priced line item and returns
exactly one order record. A rejected call returns no record at all.

## Capability Map

| Capability | Spec | Status | Milestone |
|---|---|---|---|
| Validate and price an order payload | `create-order.spec.md` | validated | v1 |

## Interface Contracts

- `createOrder(payload)` returns `{ ok: true, order }` or `{ ok: false, errors }`.
  Only a malformed payload *shape* throws, and it throws `TypeError`.
- `MAX_LINE_ITEMS` is exported as the documented upper bound on `items.length`.
- `newOrderId()` returns `ord_<12 chars>`; `createOrder` never assigns an id.

## Quality Attributes

| Attribute | Target |
|---|---|
| Purity | No I/O, no clock, no randomness inside `createOrder` |
| Determinism | The same payload yields a byte-identical record |
| Precision | Integer cents end to end; no float arithmetic anywhere |
| Error reporting | Every field-level problem is collected, not short-circuited |
