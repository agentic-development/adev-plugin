/**
 * Trims and uppercases a SKU.
 *
 * @param {unknown} raw
 * @returns {string}
 * @throws {Error} SKU_INVALID when the trimmed SKU is empty
 */
export function normalizeSku(raw) {
  const sku = String(raw ?? '').trim().toUpperCase();
  if (sku === '') throw Object.assign(new Error('SKU_INVALID: empty sku'), { code: 'SKU_INVALID' });
  return sku;
}
