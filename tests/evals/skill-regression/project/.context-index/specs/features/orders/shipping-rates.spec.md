---
charter: orders
kind: behavioral
status: review-pending
risk_level: medium
milestone: v2
revision: 1
charter-revision: 2
created: 2026-08-01
updated: 2026-08-03
---

# Live Spec: Calculate a shipping rate

> Fixture content for the skill-regression eval suite.
> Parent charter: `.context-index/specs/features/orders/charter.md`

`calculateRate(shipment)` turns a destination zone and a parcel weight into a
shipping rate in integer minor units. It performs no I/O, reads no clock, and
generates no randomness, so the same shipment always yields the same rate.

## Behavioral Contract

### Preconditions

- `shipment` is a plain object. An array, `null`, or a primitive is a *shape*
  violation, not a field violation.
- `weightGrams` is an integer number of grams. No float is accepted anywhere in
  the shipment.

### Behaviors

**B1 — Prices a valid shipment.** When `shipment` carries a known `zone` and a
non-negative integer `weightGrams`, then `calculateRate` returns
`{ ok: true, rateCents }`, where `rateCents` is the zone's base rate plus the
per-gram surcharge applied to the whole parcel weight.

**B2 — Defaults nothing.** When `weightGrams` is absent, then the shipment is
rejected; there is no implied zero weight, because a missing weight is an
integration fault rather than a free parcel.

**B3 — Throws only on a malformed shape.** When `shipment` is `null`, an array,
or a non-object, then `calculateRate` throws `TypeError`. No other input throws.

**B4 — Collects every field problem.** When both `zone` and `weightGrams` are
invalid, then `calculateRate` returns `{ ok: false, errors }` with one entry per
distinct problem — validation does not short-circuit on the first failure.

**B5 — Names the offending field.** When a field is invalid, then its message
opens with that field's name, so a caller can map a message back to the
submitted key.

**B6 — Bounds the zone set.** When `zone` is outside the three known zones, then
the shipment is rejected with exactly that one zone error.

**B7 — Rounds the surcharged rate.** When the per-gram surcharge produces a
fractional cent, then the returned `rateCents` is
rounded half up to the nearest whole cent, so no rate is ever reported with a
sub-cent component.

### Postconditions

- A returned rate is a fresh object; the input `shipment` is never mutated.
- `rateCents` is a non-negative integer.
- On a rejection, `errors` is a non-empty array of strings and no `rateCents`
  key is present.
- The same shipment yields a byte-identical result on every call.

### Error Cases

| Condition | Result |
|---|---|
| `shipment` is not a plain object | throws `TypeError` |
| `zone` missing, non-string, or unknown | `zone must be one of domestic, regional, international` |
| `weightGrams` absent | `weightGrams must be a non-negative integer` |
| `weightGrams` negative or non-integer | `weightGrams must be a non-negative integer` |

## Test Expectations

`tests/rates.test.mjs` covers B1 through B6, one `node:test` case per behavior,
with the zone table read from the module rather than hardcoded. **B7 is not
covered.** That gap is the visible half of the planted `spec-code-drift`
violation: this document still specifies half-up rounding that
`src/shipping/rates.mjs` no longer performs, so a test asserting B7 would either
fail or encode the drifted behaviour as correct.

## Traceability

| Artifact | Path |
|---|---|
| Implementation | `src/shipping/rates.mjs` |
| Public re-export | `src/index.mjs` |
| Tests | `tests/rates.test.mjs` |
| API reference | `docs/api.md` |
| Plan | `.context-index/specs/features/orders/shipping-rates.plan.md` |
| Golden sample | `.context-index/samples/order-pipeline-create-order.md` |
