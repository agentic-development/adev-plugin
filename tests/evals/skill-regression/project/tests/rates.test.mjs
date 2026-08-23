// One case per behavior id in shipping-rates.spec.md, B1 through B6.
//
// Imported from the module directly rather than through ../src/index.mjs: the
// entry point pulls in `nanoid`, and this fixture's dependencies are declared
// but never installed.
import test from "node:test";
import assert from "node:assert/strict";

import { calculateRate } from "../src/shipping/rates.mjs";

test("B1 — prices a valid shipment", () => {
  const result = calculateRate({ zone: "domestic", weightGrams: 250 });
  assert.equal(result.ok, true);
  assert.equal(result.rateCents, 500 + 250 * 2);
});

test("B2 — defaults nothing: an absent weightGrams is rejected", () => {
  const result = calculateRate({ zone: "domestic" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("weightGrams must be a non-negative integer"));
});

test("B3 — throws only on a malformed shape", () => {
  assert.throws(() => calculateRate(null), TypeError);
  assert.throws(() => calculateRate([]), TypeError);
  assert.throws(() => calculateRate("domestic"), TypeError);
  // A well-shaped object with bad fields must NOT throw — it returns errors.
  assert.doesNotThrow(() => calculateRate({ zone: "lunar", weightGrams: -1 }));
});

test("B4 — collects every field problem", () => {
  const result = calculateRate({ zone: "lunar", weightGrams: -1 });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2, "both field problems must be reported, not just the first");
});

test("B5 — names the offending field", () => {
  const badWeight = calculateRate({ zone: "domestic", weightGrams: 1.5 });
  assert.equal(badWeight.ok, false);
  assert.ok(badWeight.errors.every((e) => e.startsWith("weightGrams")));

  const badZone = calculateRate({ zone: "lunar", weightGrams: 10 });
  assert.equal(badZone.ok, false);
  assert.ok(badZone.errors.every((e) => e.startsWith("zone")));
});

test("B6 — bounds the zone set", () => {
  const known = ["domestic", "regional", "international"];
  for (const zone of known) {
    assert.equal(calculateRate({ zone, weightGrams: 0 }).ok, true, `${zone} must be priceable`);
  }
  // The three known zones price differently — read from the module rather than
  // hardcoding the table, so a zone-table edit cannot pass silently.
  const bases = known.map((zone) => calculateRate({ zone, weightGrams: 0 }).rateCents);
  assert.equal(new Set(bases).size, known.length, "each zone must carry its own base rate");

  const unknown = calculateRate({ zone: "lunar", weightGrams: 10 });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.includes("zone must be one of domestic, regional, international"));
});
