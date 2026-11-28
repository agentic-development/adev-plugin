<!-- partial_schema: plan@1 -->

# Implementation Plan: Inventory helpers

> **Methodology:** adev
> **Spec:** .context-index/specs/features/inventory/inventory.spec.md (revision 1)
> **Platform:** Node.js (ESM, `.mjs`), `node:test`
> **Implementation mode:** tdd

**Goal:** Implement the three inventory helpers described by the spec.

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3

## Task Summary

| Task | Title | Behavior |
|---|---|---|
| 1 | SKU normalization | BEH-1 |
| 2 | Audit signing | BEH-2 |
| 3 | Version constant | BEH-3 |

### Task 1: SKU normalization [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/sku.mjs`
- Test: `tests/sku.test.mjs`

**Tests:** `tests/sku.test.mjs` — create.

Implement BEH-1 in `src/sku.mjs`. Then register `normalizeSku` under `sku` in `src/registry.mjs` so `dispatch("sku", raw)` reaches it.

### Task 2: Audit signing [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/auth/audit.mjs`
- Test: `tests/auth/audit.test.mjs`

**Tests:** `tests/auth/audit.test.mjs` — create.

Implement BEH-2 in `src/auth/audit.mjs`.

### Task 3: Version constant [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/version.mjs`
- Test: `tests/version.test.mjs`

**Tests:** `tests/version.test.mjs` — create.

Export `VERSION` per BEH-3.
