---
kind: product
status: active
revision: 1
created: 2026-07-02
updated: 2026-07-28
---

# Product Charter: orders-service

> Fixture content. `orders-service` is a **fictional** Node.js library used as
> the subject of the skill-regression eval suite. Nothing here describes
> adev-plugin.

## Vision

A dependency-light ESM library that turns a raw order payload into a validated,
priced, normalized order record. Transport and persistence stay with the
caller, so the same pricing rules can back an HTTP handler, a queue consumer,
or a batch import without being rewritten three times.

## Problem Statement

Order pricing gets reimplemented per entry point, and each copy drifts: one
rounds floats, one validates currency and one does not, one applies the
discount before the line totals. The result is customers charged different
amounts for the same basket depending on which door they came through.
`orders-service` makes pricing one function with one contract.

## Module Map

| Module | Responsibility | Status |
|---|---|---|
| `orders` | Validate a payload, price it, return a normalized record | shipped |
| `shipping` | Rate lookup per destination and weight band | in progress |

## Principles

1. **Pure ESM.** `.mjs` with `import` / `export`, no CommonJS.
2. **Money is integer minor units.** Never floats, and no rounding step exists — every amount enters and leaves as an integer number of cents (ADR-0001).
3. **Validate before pricing.** No total is computed on an unvalidated payload.
4. **Every public export is documented** in `docs/api.md`.
5. **No orphan modules.** Everything under `src/` is reachable from
   `src/index.mjs`.

## Success Criteria

- One pricing path, exercised by `node --test tests/`, with every rejection
  reported through the returned `errors` array rather than an exception.
- The public surface of `src/index.mjs` and the entries in `docs/api.md` are
  the same set, checked whenever an export is added.

## Out of Scope

- HTTP, queueing, or any other transport.
- Persistence, migrations, or a schema of any kind.
- Tax and duty calculation.
- Currency conversion — an order is priced in the currency it arrives in.
