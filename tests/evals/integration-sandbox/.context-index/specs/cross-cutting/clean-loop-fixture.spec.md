---
mode: cross-cutting
affects: [orders]
kind: behavioral
status: review-pending
risk_level: low
revision: 2
created: 2026-08-26
updated: 2026-08-27
---

# Live Spec: Idempotency Request Cache

<!-- FIXTURE FOR tests/evals/convergence/run-convergence-eval.mjs.
     Companion to broken-loop-fixture.spec.md, but the opposite control: this
     fixture plants NO defects. Every behavior below is internally consistent,
     every cited function exists and matches in
     lib/loop-fixture/idempotency-cache.mjs, every design choice is fully
     resolved, and nothing depends on an artifact outside this fixture. It
     exists to measure the loop's cost/time on the case where review should
     reach PASS on (or near) the first round — the complement to
     broken-loop-fixture's four planted defect classes.
     Do not add a defect to this file. If a real review round ever BLOCKs on
     it, that is itself a finding about reviewer false-positive rate, not
     something to "fix" by editing around the report.

     Revision history: rev 1 genuinely BLOCKed once (1/2 real trials) on two
     real, non-planted defects, not reviewer noise: a constitution citation
     of a principle absent from this sandbox's own constitution.md, and
     `recordRequest`/`purgeExpired` having no named caller anywhere (the
     wiring reviewer's own grep confirmed it). Rev 2 fixes both — the cited
     principle now matches an entry that actually exists, and
     `handleRequest` is a real, named caller of both. -->

## Behavioral Contract

`handleRequest(key, handler)` (`lib/loop-fixture/idempotency-cache.mjs::handleRequest`)
is the request-handling entry point: it deduplicates repeated submissions
of the same idempotency key within a time-to-live window before invoking
`handler`, so a retried request is never processed twice.

### Preconditions

- An idempotency key is resolved (non-empty string) before any call into
  `handleRequest`.
- `lib/loop-fixture/idempotency-cache.mjs` is loaded once per process; its
  in-memory store is not shared across processes.

### Behaviors

- **BEH-1** — **When** `recordRequest(key)` (`lib/loop-fixture/idempotency-cache.mjs::recordRequest`) is called with a key that has no stored entry **then** it stores the key with the current timestamp and returns `{ duplicate: false }`.
- **BEH-2** — **When** `recordRequest(key)` is called with a key whose stored entry is no more than 300 seconds old **then** it returns `{ duplicate: true }` and does not update the stored timestamp.
- **BEH-3** — **When** `recordRequest(key)` is called with a key whose stored entry is older than 300 seconds **then** the entry is treated as expired: the call returns `{ duplicate: false }` and overwrites the stored timestamp with the current time.
- **BEH-4** — **When** `purgeExpired()` (`lib/loop-fixture/idempotency-cache.mjs::purgeExpired`) is called **then** every stored key whose timestamp is more than 300 seconds old is removed from the cache; keys within the window are left untouched.
- **BEH-5** — **When** `handleRequest(key, handler)` is called **then** it first calls `purgeExpired()`, then `recordRequest(key)`: if the result is a duplicate, `handleRequest` returns `{ duplicate: true, result: undefined }` without invoking `handler`; otherwise it invokes `handler()` and returns `{ duplicate: false, result: handler()'s return value }`. `handleRequest` is the sole caller of both `recordRequest` and `purgeExpired`.

### Postconditions

- No key with a still-live (≤300s) stored entry is ever reported as
  `{ duplicate: false }` a second time within that window.
- After `purgeExpired()` runs, the cache contains no entry older than 300
  seconds.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `recordRequest` called with an empty or non-string key | Throw with the given error code | `INVALID_IDEMPOTENCY_KEY` |

## System Constitution Reference

- **Principle 4: "Pure ESM"** (`tests/evals/integration-sandbox/.context-index/constitution.md`) — `lib/loop-fixture/idempotency-cache.mjs` is a `.mjs` file using only `export`/`import`, no CommonJS.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Idempotency cache integration | Wire `handleRequest` into the request-handling path | small |

## Acceptance Criteria

- [ ] No request with a live (≤300s) idempotency key is processed twice.
- [ ] `recordRequest` returns `{ duplicate: true }` for a repeated key within the TTL window and `{ duplicate: false }` once it expires.
- [ ] `purgeExpired` removes only entries older than 300 seconds.
- [ ] `recordRequest` rejects an empty or non-string key with `INVALID_IDEMPOTENCY_KEY`.
- [ ] `handleRequest` invokes `handler` exactly once for a non-duplicate key, and never invokes it for a duplicate key.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
