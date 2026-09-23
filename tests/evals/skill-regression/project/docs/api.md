# API Reference

Everything re-exported from `src/index.mjs` is documented here. A public symbol
missing from this page is a documentation defect.

## `createOrder(payload)`

Validates an order payload, prices it, and returns a normalized order record.

**Parameters**

| Name | Type | Description |
|---|---|---|
| `payload` | `object` | Raw order input. |
| `payload.customerId` | `string` | Non-empty customer identifier. |
| `payload.currency` | `string` | Three-letter ISO 4217 code, uppercase. |
| `payload.items` | `Array<object>` | At least one line item. |
| `payload.items[].sku` | `string` | Non-empty stock-keeping unit. |
| `payload.items[].quantity` | `number` | Positive integer. |
| `payload.items[].unitPriceCents` | `number` | Non-negative integer, minor units. |
| `payload.discountCents` | `number` | Optional. Non-negative integer, defaults to `0`. |

**Returns** — `{ ok: true, order }` on success, where `order` is
`{ customerId, currency, items, subtotalCents, discountCents, totalCents }` and
each entry of `items` carries a computed `lineTotalCents`. On a rejection it
returns `{ ok: false, errors }`, where `errors` is a non-empty array of
human-readable strings.

**Throws** — `TypeError` when `payload` is not a plain object. Malformed
*fields* are reported through `errors`; only a malformed payload *shape* throws.

**Example**

```js
import { createOrder } from "orders-service";

const result = createOrder({
  customerId: "cus_42",
  currency: "USD",
  items: [{ sku: "MUG-01", quantity: 2, unitPriceCents: 1250 }],
  discountCents: 500,
});

result.ok; // true
result.order.totalCents; // 2000
```

## `MAX_LINE_ITEMS`

`number`. Maximum number of line items a single order may carry. An order above
this limit is rejected through `errors` rather than thrown.

## `newOrderId()`

Returns a URL-safe unique order id of the form `ord_<12 chars>`. Call it when
persisting an accepted order; `createOrder` does not assign ids itself.

```js
import { newOrderId } from "orders-service";

newOrderId(); // "ord_V1StGXR8Z5jd"
```
