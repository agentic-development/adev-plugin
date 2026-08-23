/**
 * Sum the line totals of an already-priced order record.
 *
 * @param {{items: Array<{lineTotalCents: number}>}} order A priced order record.
 * @returns {number} Integer cents.
 */
export function orphanedTotalCents(order) {
  return order.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
}
