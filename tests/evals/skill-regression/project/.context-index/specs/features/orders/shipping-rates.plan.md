---
kind: plan
charter: orders
spec: .context-index/specs/features/orders/shipping-rates.spec.md
status: draft
revision: 1
created: 2026-08-03
updated: 2026-08-03
---

# Implementation Plan: Calculate a shipping rate

> **Charter:** `.context-index/specs/features/orders/charter.md`
> **Spec:** `.context-index/specs/features/orders/shipping-rates.spec.md`
> **Review:** not run — the spec is `review-pending`
> **Platform:** JavaScript (ESM, `.mjs`), Node.js 20, `node:test`

**Goal:** Ship `calculateRate(shipment)` as the single zone-and-weight pricing
path for shipping, re-exported from `src/index.mjs`.

**Architecture:** One pure module, `src/shipping/rates.mjs`, with one private
helper (`zoneBaseCents`) and one public export (`calculateRate`). Validation
collects messages into an array and returns them; only a malformed shipment
shape throws. Pricing runs after validation, never alongside it, so no rate is
ever computed on unvalidated input.

---

## File Structure

**Create:**

- `src/shipping/rates.mjs` — validation, pricing, and the public export
- `tests/rates.test.mjs` — one `node:test` case per behavior

**Modify:**

- `src/index.mjs` — re-export `calculateRate`
- `docs/api.md` — reference entry for the new public symbol

---

### Task 1: Field validation and the error contract

**Charter capability:** Calculate a shipping rate
**Spec behaviors:** B3, B4, B5
**Strategy:** unit

- [ ] **Write failing test** — a malformed shape throws `TypeError`; a bad zone
      and a bad weight together produce two messages, each opening with its own
      field name.
- [ ] **Verify test fails** — `node --test tests/rates.test.mjs`
- [ ] **Implement** — `zoneBaseCents` and the collecting loop in
      `calculateRate`.
- [ ] **Verify test passes**
- [ ] **Falsify** — short-circuit on the first error and confirm the
      two-message case goes red.

### Task 2: Apply the weight-band rounding rule

**Charter capability:** Calculate a shipping rate
**Spec behaviors:** B1, B2, B7
**Strategy:** unit
**Depends on:** Task 1

This is the `plan-task-without-test` planted violation: the task declares no TDD
expectation at all. Its checklist opens straight at implementation, with no
red-phase step, no verification step, and no falsification step. Its known-clean
twins are Tasks 1 and 3, and every task in `create-order.plan.md`.

- [ ] **Implement** — the base-rate lookup, the per-gram surcharge, and the
      half-up rounding of the surcharged total to whole cents.
- [ ] **Eyeball the numbers** — price one parcel per zone by hand and compare.

### Task 3: Zone bound, public surface, and documentation

**Charter capability:** Calculate a shipping rate
**Spec behaviors:** B6
**Strategy:** unit
**Depends on:** Task 2

- [ ] **Write failing test** — an unknown zone is rejected with exactly one
      message.
- [ ] **Verify test fails**
- [ ] **Implement** — the zone guard, the re-export from `src/index.mjs`, and
      the `docs/api.md` entry for the new symbol.
- [ ] **Verify test passes**
- [ ] **Falsify** — remove the `docs/api.md` entry for `calculateRate` and
      confirm the documented-export rule flags it.

---

## Rollback

Every task is additive within the `shipping` module. Reverting the commit range
removes `src/shipping/rates.mjs`, its test, the one re-export, and the one
`docs/api.md` section, leaving no other module touched.
