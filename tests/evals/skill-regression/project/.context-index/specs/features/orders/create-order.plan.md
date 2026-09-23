---
kind: plan
charter: orders
spec: .context-index/specs/features/orders/create-order.spec.md
status: complete
revision: 1
created: 2026-07-05
updated: 2026-07-28
---

# Implementation Plan: Validate and price an order payload

> **Charter:** `.context-index/specs/features/orders/charter.md`
> **Spec:** `.context-index/specs/features/orders/create-order.spec.md`
> **Review:** PASS (2026-07-04, revision 2)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js 20, `node:test`

**Goal:** Ship `createOrder(payload)` as the single validate-then-price path
for the `orders` module, re-exported from `src/index.mjs` and documented in
`docs/api.md`.

**Architecture:** One pure module, `src/orders/create-order.mjs`, with two
private helpers (`isIntegerAtLeast`, `validateItem`) and two exports
(`createOrder`, `MAX_LINE_ITEMS`). Validation collects messages into an array
and returns them; only a malformed payload shape throws. Pricing runs after
validation, never alongside it, so no total is ever computed on unvalidated
input.

---

## File Structure

**Create:**

- `src/orders/create-order.mjs` — validation, pricing, and the two exports
- `tests/create-order.test.mjs` — one `node:test` case per behavior

**Modify:**

- `src/index.mjs` — re-export `createOrder` and `MAX_LINE_ITEMS`
- `docs/api.md` — reference entries for both new public symbols

---

### Task 1: Field validation and the error contract

**Charter capability:** Validate and price an order payload
**Spec behaviors:** B3, B4, B5
**Strategy:** unit

- [x] **Write failing test** — a malformed shape throws `TypeError`; three
      simultaneously invalid fields produce three messages; an invalid line
      item is named by its index.
- [x] **Verify test fails** — `node --test tests/create-order.test.mjs`
- [x] **Implement** — `isIntegerAtLeast`, `validateItem`, and the collecting
      loop in `createOrder`.
- [x] **Verify test passes**
- [x] **Falsify** — short-circuit on the first error and confirm the
      three-message case goes red.

### Task 2: Pricing and the discount bound

**Charter capability:** Validate and price an order payload
**Spec behaviors:** B1, B2, B7
**Strategy:** unit
**Depends on:** Task 1

- [x] **Write failing test** — line totals, subtotal, default discount, and a
      discount above the subtotal.
- [x] **Verify test fails**
- [x] **Implement** — the `reduce` over priced line items, the `discountCents`
      default, and the post-pricing bound check.
- [x] **Verify test passes**
- [x] **Falsify** — drop the bound check and confirm the over-discount case
      goes red with a negative total.

### Task 3: Item-count bound, public surface, and documentation

**Charter capability:** Validate and price an order payload
**Spec behaviors:** B6
**Strategy:** unit
**Depends on:** Task 2

- [x] **Write failing test** — `MAX_LINE_ITEMS + 1` items is rejected with
      exactly one message.
- [x] **Verify test fails**
- [x] **Implement** — the length guard, the re-export from `src/index.mjs`,
      and the `docs/api.md` entries for both symbols.
- [x] **Verify test passes**
- [x] **Falsify** — remove the `docs/api.md` entry for `MAX_LINE_ITEMS` and
      confirm the documented-export rule flags it.

---

## Rollback

Every task is additive within the `orders` module. Reverting the commit range
removes `src/orders/create-order.mjs`, its test, the two re-exports, and the
two `docs/api.md` sections, leaving no other module touched.
