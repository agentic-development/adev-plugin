/**
 * Planted violation: `orphan-source-file`.
 *
 * Nothing imports this module. It is not reachable from `src/index.mjs`, which
 * the fixture constitution's principle 3 ("No orphan modules") forbids. Its
 * known-clean twin is `src/shipping/rates.mjs`, which `src/index.mjs` imports.
 *
 * The module is otherwise ordinary, correct, documented ESM: the defect is its
 * reachability, not its contents, so a scanner that flags it for any other
 * reason is flagging the wrong thing.
 */

/**
 * Sum the line totals of an already-priced order record.
 *
 * @param {{items: Array<{lineTotalCents: number}>}} order A priced order record.
 * @returns {number} Integer cents.
 */
export function orphanedTotalCents(order) {
  return order.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
}
