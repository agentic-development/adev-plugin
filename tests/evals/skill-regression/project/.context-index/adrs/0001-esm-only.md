# ADR 0001: ESM-only, with money as integer minor units

## Status

Accepted

## Date

2026-07-02

## Context

`orders-service` is consumed from three places inside the fictional product: an
HTTP handler, a queue consumer, and a batch importer. Two questions had to be
settled before the first module landed, because both are expensive to reverse
once callers exist.

**Module format.** An earlier internal prototype shipped dual CommonJS and ESM
builds. Every bug filed against it was a dual-package hazard: two copies of the
same module loaded under two specifiers, each with its own `MAX_LINE_ITEMS`,
and an `instanceof` check that failed across the boundary. The build step
existed only to serve the CommonJS half.

**Money representation.** The prototype priced in floating-point currency
units. `0.1 + 0.2` sized discounts produced totals a cent off, and the
corrections were applied at whichever layer noticed, so the same basket
totalled differently depending on the entry point.

## Decision

1. **The package is ESM-only.** Every source file is `.mjs`, uses `import` /
   `export`, and `package.json` declares `"type": "module"`. No CommonJS build
   is published, and a `require(...)` call or a `module.exports` assignment
   anywhere under `src/` is a defect rather than a style preference.
2. **All money is integer minor units (cents).** Every monetary field on the
   payload and on the returned record is an integer count of cents.
   Multiplication happens on integers, and no rounding step exists because
   nothing is ever fractional.
3. **No build step.** What is published is what is written. A consumer on an
   older runtime pins an older version rather than being served a transpiled
   copy.

## Consequences

### Positive

- One module instance per specifier: `MAX_LINE_ITEMS` compares equal
  everywhere, and there is no dual-package hazard to diagnose.
- Totals are exact by construction. The `discountCents must not exceed the
  subtotal` rule can be an integer comparison rather than an epsilon.
- Debugging reads the shipped file, because the shipped file is the source.

### Negative

- CommonJS consumers must use dynamic `import()`. This is accepted; the three
  in-product consumers are all ESM.
- Callers that hold currency as a decimal must convert at the boundary, and a
  conversion mistake surfaces as a hundred-fold price error rather than a
  rounding error. The `docs/api.md` entry for every monetary parameter says
  "minor units" explicitly for this reason.

### Neutral

- Test files are `.mjs` under `node:test`, matching the source, so there is no
  second toolchain to keep current.
