---
id: collect-field-errors
scope: orders
title: Collect every field error before returning, never short-circuit
pattern: In createOrder and any validator it grows, push each failure onto an errors array and return the whole array. A caller fixing a form wants every problem in one round trip, and the per-index message prefix (items[i].field) is what lets them map a message back to an input.
anti-pattern: Return on the first invalid field. The caller resubmits, hits the second problem, resubmits again — and each round trip re-runs pricing on a payload that was never going to be accepted.
tags: [validation, error-reporting]
confidence: high
evidence:
  - path: .context-index/specs/features/orders/create-order.spec.md
    date: 2026-07-28
    source: validate
contradicted-by: []
created: 2026-07-14
updated: 2026-07-28
---

---
id: integer-cents-only
scope: orders
title: Money is integer cents end to end; a float in a payload is a defect
pattern: Accept, compute, and return every monetary value as an integer count of minor units. Multiply quantity by unitPriceCents on integers and compare the discount to the subtotal with a plain integer comparison.
anti-pattern: Accept a decimal currency amount and round it at the boundary. Rounding at more than one layer is how the same basket totals differently depending on which entry point priced it.
tags: [money, precision]
confidence: high
evidence:
  - path: .context-index/adrs/0001-esm-only.md
    date: 2026-07-02
    source: learn
contradicted-by: []
created: 2026-07-02
updated: 2026-07-02
---

---
id: shape-throws-fields-do-not
scope: orders
title: Only a malformed payload shape throws; field problems are returned
pattern: Throw TypeError when payload is null, an array, or a primitive — a caller that passed the wrong kind of thing has a bug. Report every field-level and business-rule rejection through the returned errors array so ordinary rejection needs no try block.
anti-pattern: Throw a validation error for a bad currency code. It forces every caller to wrap an expected outcome in exception handling, and the two failure classes stop being distinguishable.
tags: [errors, api-contract]
confidence: medium
evidence:
  - path: tests/create-order.test.mjs
    date: 2026-07-20
    source: validate
contradicted-by: []
created: 2026-07-20
updated: 2026-07-28
---
