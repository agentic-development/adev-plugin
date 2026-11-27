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

Implement BEH-1. Use this implementation as written:

```javascript
export function normalizeSku(raw) {
  const sku = String(raw ?? '').trim().toUpperCase();
  if (sku === '') throw Object.assign(new Error('SKU_INVALID: empty sku'), { code: 'SKU_INVALID' });
  return sku;
}
```

Then register it under `sku` in `src/registry.mjs` so `dispatch("sku", raw)` reaches it.

### Task 2: Audit signing [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/auth/audit.mjs`
- Test: `tests/auth/audit.test.mjs`

**Tests:** `tests/auth/audit.test.mjs` — create.

Implement BEH-2. Use this implementation as written:

```javascript
import { createHmac } from 'node:crypto';

/**
 * Signs an audit record.
 *
 * @param {object} record
 * @param {string} secret
 * @returns {{ record: object, signature: { alg: string, value: string } }}
 */
export function signAudit(record, secret) {
  const value = createHmac('sha256', secret).update(JSON.stringify(record)).digest('base64url');
  return { record, signature: { alg: 'HS256', value } };
}
```

### Task 3: Version constant [specialist: none]

**Strategy:** unit (source: detected, confidence: high)
**Files:**
- Create: `src/version.mjs`
- Test: `tests/version.test.mjs`

**Tests:** `tests/version.test.mjs` — create.

Export `VERSION` per BEH-3.
