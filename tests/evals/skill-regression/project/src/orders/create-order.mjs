/**
 * Order creation: validate a raw payload, price it, return a normalized record.
 *
 * Money is integer minor units (cents) throughout. Nothing here performs I/O.
 */

/** Maximum number of line items a single order may carry. */
export const MAX_LINE_ITEMS = 50;

/** ISO 4217 alphabetic code: exactly three uppercase letters. */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * True for a finite integer at or above `min`.
 *
 * @param {unknown} value Candidate number.
 * @param {number} min Inclusive lower bound.
 * @returns {boolean}
 */
function isIntegerAtLeast(value, min) {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}

/**
 * Collect every validation failure for one line item.
 *
 * @param {unknown} item Candidate line item.
 * @param {number} index Position in the items array, used in the error text.
 * @returns {string[]} Zero or more human-readable messages.
 */
function validateItem(item, index) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return [`items[${index}] must be an object`];
  }
  const errors = [];
  if (typeof item.sku !== "string" || item.sku.trim() === "") {
    errors.push(`items[${index}].sku must be a non-empty string`);
  }
  if (!isIntegerAtLeast(item.quantity, 1)) {
    errors.push(`items[${index}].quantity must be a positive integer`);
  }
  if (!isIntegerAtLeast(item.unitPriceCents, 0)) {
    errors.push(`items[${index}].unitPriceCents must be a non-negative integer`);
  }
  return errors;
}

/**
 * Validate an order payload, price it, and return a normalized order record.
 *
 * Field-level problems are reported through the returned `errors` array so the
 * caller can branch without `try`. Only a malformed payload *shape* throws.
 *
 * @param {object} payload Raw order input.
 * @param {string} payload.customerId Non-empty customer identifier.
 * @param {string} payload.currency Three-letter uppercase ISO 4217 code.
 * @param {Array<object>} payload.items At least one line item.
 * @param {number} [payload.discountCents] Non-negative integer, defaults to 0.
 * @returns {{ok: true, order: object} | {ok: false, errors: string[]}}
 * @throws {TypeError} When `payload` is not a plain object.
 */
export function createOrder(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("createOrder(payload): payload must be an object");
  }

  const { customerId, currency, items, discountCents = 0 } = payload;
  const errors = [];

  if (typeof customerId !== "string" || customerId.trim() === "") {
    errors.push("customerId must be a non-empty string");
  }
  if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
    errors.push("currency must be a three-letter uppercase ISO 4217 code");
  }
  if (!Array.isArray(items) || items.length === 0) {
    errors.push("items must be a non-empty array");
  } else if (items.length > MAX_LINE_ITEMS) {
    errors.push(`items must hold at most ${MAX_LINE_ITEMS} line items`);
  } else {
    for (const [index, item] of items.entries()) errors.push(...validateItem(item, index));
  }
  if (!isIntegerAtLeast(discountCents, 0)) {
    errors.push("discountCents must be a non-negative integer");
  }

  if (errors.length > 0) return { ok: false, errors };

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0,
  );
  if (discountCents > subtotalCents) {
    return { ok: false, errors: ["discountCents must not exceed the subtotal"] };
  }

  return {
    ok: true,
    order: {
      customerId,
      currency,
      items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.quantity * item.unitPriceCents,
      })),
      subtotalCents,
      discountCents,
      totalCents: subtotalCents - discountCents,
    },
  };
}
