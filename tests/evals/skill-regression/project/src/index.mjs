/**
 * Public entry point for `orders-service`.
 *
 * Everything re-exported here is documented in `docs/api.md`.
 */

import { nanoid } from "nanoid";

import { createOrder, MAX_LINE_ITEMS } from "./orders/create-order.mjs";

/**
 * Mint an order id. Thin wrapper so the entry point has a real use for its
 * `nanoid` dependency — `ajv` is declared and imported by nothing, which is
 * the planted `unused-dependency` violation.
 *
 * @returns {string} a URL-safe unique order id
 */
export function newOrderId() {
  return `ord_${nanoid(12)}`;
}

export { createOrder, MAX_LINE_ITEMS };
