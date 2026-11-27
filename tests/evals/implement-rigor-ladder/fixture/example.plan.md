<!-- partial_schema: plan@1 -->

# Implementation Plan: Catalog listing

> **Methodology:** adev
> **Spec:** .context-index/specs/features/example/example.spec.md (revision 1)
> **Platform:** Node.js (ESM, `.mjs`), `node:test`
> **Implementation mode:** tdd

**Goal:** Implement the catalog library described by the spec, extending the existing seed modules.

## Parallelization

- Group A (sequential): Task 3 → Task 5 → Task 7
- Group B (independent): Task 1
- Group C (independent): Task 2
- Group D (independent): Task 4
- Group E (independent): Task 6

Group A's last task also builds on Group B's `paginate`, so it runs after Group B.

## Task Summary

| Task | Title | Behavior |
|---|---|---|
| 1 | Pagination | BEH-1 |
| 2 | Configuration validation | BEH-2 |
| 3 | Slugs | BEH-3 |
| 4 | Percent coupons | BEH-4 |
| 5 | Item formatting | BEH-5 |
| 6 | Signed tokens | BEH-6 |
| 7 | List handler | BEH-7 |

### Task 1: Pagination [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `src/pagination.mjs`
- Test: `tests/pagination.test.mjs`

**Tests:** `tests/pagination.test.mjs` — extend.

Add `paginate(items, { page, pageSize })` beside the existing `pageCount` helper. The module as a whole must satisfy BEH-1, including the existing helper.

### Task 2: Configuration validation [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `src/config.mjs`
- Test: `tests/config.test.mjs`

**Tests:** `tests/config.test.mjs` — extend.

Add `pageSize` validation to `parseConfig`. The function as a whole must satisfy every `CONFIG_INVALID` case in BEH-2.

### Task 3: Slugs [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/slug.mjs`
- Test: `tests/slug.test.mjs`

**Tests:** `tests/slug.test.mjs` — create.

Implement `slugify(label)` per BEH-3.

### Task 4: Percent coupons [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `src/discount.mjs`
- Test: `tests/discount.test.mjs`

**Tests:** `tests/discount.test.mjs` — extend.

Add `kind: "percent"` coupons and the `COUPON_INVALID` error to `applyDiscount`. The function as a whole must satisfy BEH-4.

### Task 5: Item formatting [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Modify: `src/format.mjs`
- Test: `tests/format.test.mjs`

**Tests:** `tests/format.test.mjs` — extend.

Add the slug (from Task 3's `slugify`) and the currency to `formatItem`'s output. The output must match BEH-5 exactly.

### Task 6: Signed tokens [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/auth/token.mjs`
- Test: `tests/auth/token.test.mjs`

**Tests:** `tests/auth/token.test.mjs` — create.

Implement `signToken` and `verifyToken` per BEH-6 with `node:crypto`.

### Task 7: List handler [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/handlers/list.mjs`
- Test: `tests/handlers/list.test.mjs`

**Tests:** `tests/handlers/list.test.mjs` — create.

Implement `listHandler` per BEH-7 on top of Task 1's `paginate` and Task 5's `formatItem`, and register it under `list` in `src/registry.mjs` so `dispatch("list", ...)` reaches it.
