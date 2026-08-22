/**
 * Public entry point for `orders-service`.
 *
 * The fixture constitution requires every symbol re-exported here to carry a
 * matching `docs/api.md` entry. `createOrder`, `MAX_LINE_ITEMS` and
 * `newOrderId` do. `calculateRate` deliberately does NOT — it is the planted
 * `undocumented-public-api` violation, and it is the ONLY undocumented public
 * symbol on this surface, so a scanner that reports two is over-reporting.
 *
 * This file declares NO source-of-truth change date on purpose. It is a
 * re-export surface named in BOTH specs' Traceability, so a date here would be
 * newer than the clean spec's `updated:` and would invert the
 * `stale-spec-frontmatter` pair — the clean twin reading staler than the plant.
 * Staleness for each slice is measured against its implementation module:
 * `src/orders/create-order.mjs` (2026-07-20) and `src/shipping/rates.mjs`
 * (2026-08-19).
 *
 * The `calculateRate` import is also what makes `src/shipping/rates.mjs`
 * reachable from the entry point, which is what qualifies rates.mjs as the
 * `orphan-source-file` known-clean twin. The planted violation for that class
 * is a module under `src/orders/` that no import statement anywhere names.
 */

import { nanoid } from "nanoid";

import { createOrder, MAX_LINE_ITEMS } from "./orders/create-order.mjs";
import { calculateRate } from "./shipping/rates.mjs";

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

export { createOrder, MAX_LINE_ITEMS, calculateRate };
