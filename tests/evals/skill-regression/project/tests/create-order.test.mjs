import test from "node:test";
import assert from "node:assert/strict";

// Imported from the module directly rather than through ../src/index.mjs:
// the entry point pulls in `nanoid`, and this fixture's dependencies are
// declared but never installed.
import { createOrder, MAX_LINE_ITEMS } from "../src/orders/create-order.mjs";

/**
 * A valid payload, shallow-merged with `overrides`.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function payload(overrides = {}) {
  return {
    customerId: "cus_42",
    currency: "USD",
    items: [{ sku: "MUG-01", quantity: 2, unitPriceCents: 1250 }],
    ...overrides,
  };
}

test("prices a valid order and returns line totals", () => {
  const result = createOrder(payload({ discountCents: 500 }));
  assert.equal(result.ok, true);
  assert.equal(result.order.subtotalCents, 2500);
  assert.equal(result.order.discountCents, 500);
  assert.equal(result.order.totalCents, 2000);
  assert.equal(result.order.items[0].lineTotalCents, 2500);
});

test("defaults discountCents to zero", () => {
  const result = createOrder(payload());
  assert.equal(result.ok, true);
  assert.equal(result.order.totalCents, 2500);
});

test("throws only on a malformed payload shape", () => {
  assert.throws(() => createOrder(null), TypeError);
  assert.throws(() => createOrder([]), TypeError);
});

test("reports field problems through errors rather than throwing", () => {
  const result = createOrder({ customerId: "", currency: "usd", items: [] });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors.some((e) => e.includes("customerId")));
  assert.ok(result.errors.some((e) => e.includes("currency")));
  assert.ok(result.errors.some((e) => e.includes("items")));
});

test("rejects a non-positive quantity by index", () => {
  const result = createOrder(
    payload({ items: [{ sku: "MUG-01", quantity: 0, unitPriceCents: 100 }] }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["items[0].quantity must be a positive integer"]);
});

test("rejects more than MAX_LINE_ITEMS line items", () => {
  const items = Array.from({ length: MAX_LINE_ITEMS + 1 }, (_, index) => ({
    sku: `SKU-${index}`,
    quantity: 1,
    unitPriceCents: 100,
  }));
  const result = createOrder(payload({ items }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [`items must hold at most ${MAX_LINE_ITEMS} line items`]);
});

test("rejects a discount larger than the subtotal", () => {
  const result = createOrder(payload({ discountCents: 999999 }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["discountCents must not exceed the subtotal"]);
});
