/**
 * Trims and uppercases a SKU.
 *
 * @param {unknown} raw
 * @returns {string | { error: { code: 'SKU_INVALID' } }} the SKU, or the
 *   SKU_INVALID error value when the trimmed SKU is empty
 */
export function normalizeSku(raw) {
  const sku = String(raw ?? '').trim().toUpperCase();
  if (sku === '') return { error: { code: 'SKU_INVALID' } };
  return sku;
}
