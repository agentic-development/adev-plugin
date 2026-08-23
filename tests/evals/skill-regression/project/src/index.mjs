/**
 * Public entry point for `orders-service`.
 */

import { nanoid } from "nanoid";

import { createOrder, MAX_LINE_ITEMS } from "./orders/create-order.mjs";
import { calculateRate } from "./shipping/rates.mjs";

/**
 * Mint an order id.
 *
 * @returns {string} a URL-safe unique order id
 */
export function newOrderId() {
  return `ord_${nanoid(12)}`;
}

export { createOrder, MAX_LINE_ITEMS, calculateRate };
