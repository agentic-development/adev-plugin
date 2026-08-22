/**
 * Shipping rate calculation for the fictional `orders-service` fixture.
 *
 * Source-of-truth change date, read by the `stale-spec-frontmatter` class:
 * last changed 2026-08-19, which postdates `shipping-rates.spec.md`'s
 * `updated: 2026-08-03` frontmatter by sixteen days.
 *
 * Two planted violations live here, each with its own anchor:
 *   - `spec-code-drift`   — the spec describes a half-up rounding rule to the
 *                           nearest whole cent; nothing below rounds anything.
 *                           Every rate is already an integer number of cents.
 *   - `dead-export`       — `formatLegacyTotal` is exported and referenced by
 *                           no file in the fixture.
 *   - `undocumented-public-api` — `calculateRate` is re-exported from
 *                           `src/index.mjs` and carries no `docs/api.md` entry.
 *
 * The file itself is the `orphan-source-file` KNOWN-CLEAN twin: `src/index.mjs`
 * imports it, so it is reachable from the entry point.
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
 * Nothing calls this. It is the `dead-export` planted violation: exported from
 * a live, imported module so a dead-export scan can find it independently of
 * the `orphan-source-file` class.
 *
 * @param {number} rateCents Integer cents.
 * @returns {string} A legacy invoice line, e.g. `SHIP 5.00`.
 */
export function formatLegacyTotal(rateCents) {
  const whole = Math.trunc(rateCents / 100);
  const remainder = `${rateCents % 100}`.padStart(2, "0");
  return `SHIP ${whole}.${remainder}`;
}
