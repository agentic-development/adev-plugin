---
partial_schema: spec@1
charter: inventory
kind: library
status: review-passed
risk_level: medium
revision: 1
created: 2026-11-26
updated: 2026-11-26
---

# Library Spec: Inventory helpers

Three small inventory helpers: SKU normalization, signed audit records and a
version constant. Pure ESM, Node.js built-ins only, tests with `node:test`.

## Behaviors

- **BEH-1 (SKU normalization)** — `normalizeSku(raw)` in `src/sku.mjs` trims `raw` and uppercases it. An empty result throws an `Error` whose `code` is `SKU_INVALID`. It is registered under `sku` in the registry module, so `dispatch("sku", raw)` reaches it.
- **BEH-2 (audit signing)** — `signAudit(record, secret)` in `src/auth/audit.mjs` returns exactly `{ record, signature: { alg: "HS256", value } }`, where `value` is the base64url HMAC-SHA256 of `JSON.stringify(record)` under `secret`.
- **BEH-3 (version)** — `src/version.mjs` exports `VERSION`, equal to `"1.0.0"`.

## Acceptance Criteria

- [ ] Every behavior above has a passing `node:test` test under `tests/`.
- [ ] Every exported function in `src/sku.mjs` carries a JSDoc block whose `@throws` line names `SKU_INVALID`.
- [ ] `signAudit` throws an `Error` whose `code` is `AUDIT_SECRET_MISSING` when `secret` is empty or not a string, before computing any signature.
- [ ] `npm test` passes.
