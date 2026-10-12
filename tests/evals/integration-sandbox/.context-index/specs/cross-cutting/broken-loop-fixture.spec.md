---
mode: cross-cutting
affects: [orders]
kind: behavioral
status: review-pending
risk_level: high
revision: 1
created: 2026-08-21
updated: 2026-08-21
---

# Live Spec: Order Submission Rate Limiter

<!-- FIXTURE FOR tests/evals/convergence/run-convergence-eval.mjs.
     Do not "fix" this file by hand. It exists to be reviewed, BLOCKed, and
     driven through the real /adev:build --full --auto loop. Its four planted
     defects are load-bearing:
       - BEH-2 contradicts BEH-1 (defect-class: a genuine, fixable inconsistency)
       - BEH-3 names a function absent from lib/loop-fixture/rate-limiter.mjs
         (mechanism-existence defect)
       - BEH-4 states an unresolved design choice (decision-class: not fixable
         by rewording alone)
       - BEH-5 depends on a capability the orders charter does not list
         (external-class: the real fix lives in a different artifact)
     The eval script resets this file (and its sidecars + lifecycle log)
     between trials via `git checkout` + `git clean`, scoped to this fixture. -->

## Behavioral Contract

The order-submission path rate-limits requests per customer key using
`lib/loop-fixture/rate-limiter.mjs`, so a single customer cannot exhaust
downstream order-processing capacity.

### Preconditions

- A customer key is resolved before any call into the rate limiter.
- `lib/loop-fixture/rate-limiter.mjs` is loaded once per process.

### Behaviors

- **BEH-1** — **When** a customer key issues more than 10 requests via `checkRateLimit(key)` within a 60-second window **then** the limiter returns `{ allowed: false }` for every request beyond the 10th.
- **BEH-2** — **When** `getRemainingQuota(key)` is queried immediately after the window's 10th request **then** it returns 5 remaining requests.
- **BEH-3** — **When** a key's 60-second window elapses **then** `resetRateLimitWindow(key)` is called to clear its counter before the next request is evaluated against a fresh window.
- **BEH-4** — **When** two concurrent order-submission requests for the same key both observe an expired window at the same instant **then** the limiter resolves the race between whichever request resets the window first; this spec does not state whether last-observed-expiry-wins or first-observed-expiry-wins, and both are viable.
- **BEH-5** — **When** a request is denied by the limiter **then** the denial is surfaced as part of the orders module's rate-limited order submission capability, which must be reflected in the orders charter's Capability Map.

### Postconditions

- No customer key exceeds 10 allowed requests per 60-second window.
- `getRemainingQuota(key)` never returns a value inconsistent with the limit enforced by `checkRateLimit(key)`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `checkRateLimit` called with an empty key | Reject with a validation error | `INVALID_RATE_LIMIT_KEY` |
| Window state is corrupted (negative count) | Reset the window and allow the request | `RATE_LIMIT_STATE_RECOVERED` |

## System Constitution Reference

- **Principle: "Minimize external dependencies."** — The limiter uses only an in-memory `Map`; no new dependency.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Rate limiter integration | Wire `checkRateLimit`/`getRemainingQuota` into order submission | small |

## Acceptance Criteria

- [ ] No customer key exceeds 10 requests per 60-second window.
- [ ] `getRemainingQuota` and `checkRateLimit` report a consistent limit.
- [ ] Window reset behavior is implemented and race-free.
- [ ] Rate-limited order submission is reflected in the orders charter's Capability Map.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
