---
partial_schema: spec@1
charter: example
kind: library
status: review-passed
risk_level: medium
revision: 1
created: 2026-11-26
updated: 2026-11-26
---

# Library Spec: Catalog listing

A small catalog library: pagination, configuration, slugs, discounts, item
formatting, signed tokens and a `list` request handler. Pure ESM, Node.js
built-ins only, tests with `node:test`.

## Behaviors

- **BEH-1 (pagination)** — `pageCount(total, pageSize)` returns `Math.ceil(total / pageSize)`, and `0` when `total` is `0`. `paginate(items, { page, pageSize })` returns `{ items, page, pageSize, pageCount, total }`. Pages are 1-based. A `page` outside `1..pageCount` returns `items: []` and never throws.
- **BEH-2 (configuration)** — `parseConfig(text)` returns `{ pageSize, currency }`, defaulting to `pageSize: 20` and `currency: "USD"`. It throws an `Error` whose `code` is `CONFIG_INVALID` when:
  - `text` is not valid JSON;
  - the JSON value is anything other than a plain object, including `null` and arrays;
  - `pageSize` is present and is not a positive integer.
- **BEH-3 (slugs)** — `slugify(label)` lowercases the label, replaces every run of characters outside `[a-z0-9]` with a single `-`, and trims leading and trailing `-`.
- **BEH-4 (discounts)** — `applyDiscount(priceCents, coupon, now)` takes a coupon `{ kind, amount, expiresAt }`:
  - `kind: "fixed"` subtracts `amount` cents; `kind: "percent"` subtracts `Math.floor(priceCents * amount / 100)`.
  - A coupon whose `expiresAt` is at or before `now` leaves the price unchanged.
  - The result is never below `0`.
  - Any other `kind` throws an `Error` whose `code` is `COUPON_INVALID`.
- **BEH-5 (item formatting)** — `formatItem(item, currency)` returns exactly `{ id, label, slug, price: { cents, currency } }`, with `slug` from `slugify(item.label)` and `cents` from `item.priceCents`. No other keys.
- **BEH-6 (tokens)** — `signToken(payload, secret)` returns `<base64url(JSON payload)>.<base64url(HMAC-SHA256 of the first part)>`. `verifyToken(token, secret)` returns the payload when the signature matches, compared with `crypto.timingSafeEqual`, and `null` for a bad signature or a malformed token. It never throws.
- **BEH-7 (list handler)** — `listHandler({ page, pageSize }, { items, currency })` returns `{ status: 200, body: { items, page, pageCount, total } }`, where `body.items` are the formatted items of the requested page. Every handler is registered in the `handlers` map of the registry module, and `dispatch(name, ...args)` reaches it; `dispatch` of an unregistered name returns `{ status: 404 }`.

## Acceptance Criteria

- [ ] Every behavior above has a passing `node:test` test under `tests/`.
- [ ] `npm test` passes.
