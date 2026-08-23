# Golden Sample: order pipeline — createOrder

> **Pattern:** validate-then-price, errors collected and returned
> **Source:** `src/orders/create-order.mjs`
> **Quality Score:** 94/100
> **Extracted:** 2026-07-28
> **Constitution Principles:** Pure ESM; Validation before pricing; Money in
> integer minor units; JSDoc on every exported function

## Why This Is a Golden Sample

It is the reference shape for any new module under `src/`. Four things make it
worth copying:

1. **Two phases, in order.** Every field is validated and every message
   collected before a single cent is multiplied. No total can be computed on
   unvalidated input because pricing sits after an early return.
2. **Two failure classes, kept apart.** A malformed payload *shape* throws
   `TypeError`; every field-level and business-rule rejection is returned in
   `errors`. Callers branch on `result.ok` and never wrap an expected outcome
   in a `try`.
3. **Small private helpers.** `isIntegerAtLeast` and `validateItem` are
   module-private, each with one job, so the exported function reads as a
   sequence of decisions rather than a wall of conditionals.
4. **Integers throughout.** No float appears anywhere, so there is no rounding
   step and therefore no place for two layers to round differently.

## The Code

The pricing phase, which only ever runs on a validated payload:

```js
// Guard clause first: everything below is unreachable on invalid input.
if (errors.length > 0) return { ok: false, errors };

const subtotalCents = items.reduce(
  (sum, item) => sum + item.quantity * item.unitPriceCents,
  0,
);
// The discount bound is a BUSINESS rule, not a field rule: it can only be
// checked once the subtotal exists, so it is reported alone.
if (discountCents > subtotalCents) {
  return { ok: false, errors: ["discountCents must not exceed the subtotal"] };
}
```

The per-item validator, showing the index-prefixed message convention that lets
a caller map a message back to a position in the submitted array:

```js
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
  // ...one push per distinct problem; never an early return.
  return errors;
}
```

## Test Coverage

`tests/create-order.test.mjs` holds one `node:test` case per behavior in
`create-order.spec.md`. Two are worth imitating specifically:

- The multi-error case asserts `errors.length === 3` for three simultaneously
  invalid fields. That is what makes "collect, do not short-circuit" a checked
  property rather than a comment.
- The item-count case builds its input from `MAX_LINE_ITEMS + 1` rather than
  from a literal `51`, so raising the bound cannot leave a stale test passing
  for the wrong reason.

## Usage Guide

Reach for this sample when adding any function that accepts caller-supplied
input under `src/` — the `shipping` module's rate lookup is the next one. Copy
the phase order, the two failure classes, and the index-prefixed message
convention. Do not copy the specific field list; that is domain detail.
