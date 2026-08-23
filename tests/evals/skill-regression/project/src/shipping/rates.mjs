/**
 * Shipping rate calculation for the fictional `orders-service` fixture.
 *
 * Module change date: last changed 2026-08-19.
 */

/** Flat per-gram surcharge applied above the base band, in integer cents. */
const PER_GRAM_SURCHARGE_CENTS = 2;

/** Base rate per destination zone, in integer cents. */
const ZONE_BASE_CENTS = { domestic: 500, regional: 900, international: 2400 };

/**
 * Base rate for a destination zone.
 *
 * @param {string} zone One of `domestic`, `regional`, `international`.
 * @returns {number} Integer cents, or `0` for an unknown zone.
 */
function zoneBaseCents(zone) {
  return Object.prototype.hasOwnProperty.call(ZONE_BASE_CENTS, zone)
    ? ZONE_BASE_CENTS[zone]
    : 0;
}

/**
 * Calculate a shipping rate for one destination zone and weight.
 *
 * @param {object} shipment Shipment descriptor.
 * @param {string} shipment.zone Destination zone.
 * @param {number} shipment.weightGrams Non-negative integer weight in grams.
 * @returns {{ok: true, rateCents: number} | {ok: false, errors: string[]}}
 * @throws {TypeError} When `shipment` is not a plain object.
 */
export function calculateRate(shipment) {
  if (shipment === null || typeof shipment !== "object" || Array.isArray(shipment)) {
    throw new TypeError("calculateRate(shipment): shipment must be an object");
  }

  const { zone, weightGrams } = shipment;
  const errors = [];

  if (typeof zone !== "string" || zoneBaseCents(zone) === 0) {
    errors.push("zone must be one of domestic, regional, international");
  }
  if (!Number.isInteger(weightGrams) || weightGrams < 0) {
    errors.push("weightGrams must be a non-negative integer");
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, rateCents: zoneBaseCents(zone) + weightGrams * PER_GRAM_SURCHARGE_CENTS };
}

/**
 * Render a rate the way the retired v0.2 invoice renderer did.
 *
 * @param {number} rateCents Integer cents.
 * @returns {string} A legacy invoice line, e.g. `SHIP 5.00`.
 */
export function formatLegacyTotal(rateCents) {
  const whole = Math.trunc(rateCents / 100);
  const remainder = `${rateCents % 100}`.padStart(2, "0");
  return `SHIP ${whole}.${remainder}`;
}
