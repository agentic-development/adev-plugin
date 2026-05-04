# Architecture Review: customer-orders

> **Date:** 2026-05-03
> **Spec:** .context-index/specs/features/orders/customer-orders.md
> **Charter:** .context-index/specs/features/orders/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 300f2697ffdfefb7e017c4b92559d75f77ec912f

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | `warning` | Acceptance Criteria §4 — Conflates the behavioral invariant ("query must use parameterized placeholders") with a test verification technique ("read the source and assert the query string contains `$1`"). Source inspection is a test methodology, not a behavioral contract. If the implementation changes shape (e.g., query builder), this criterion becomes brittle.
  - **Recommendation:** State the invariant only in Acceptance Criteria; move source-inspection technique to Test Requirements.

- **SA-2** | `suggestion` | Behavioral Contract — Input — No explicit statement that a non-existent but valid `customerId` returns `[]` identically to a customer with no orders. This equivalence is implicit and could cause confusion for specs referencing this contract.
  - **Recommendation:** Add one sentence to the Behavioral Contract clarifying this equivalence.

- **SA-3** | `suggestion` | Acceptance Criteria §3 — Asserts `created_at` returns a JavaScript `Date`, which depends on default `pg` type parser behavior for `TIMESTAMPTZ`. This is an undeclared dependency on library internals.
  - **Recommendation:** Add a note that this type guarantee assumes default `pg` type parser behavior.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1** | `warning` | input-validation — The spec states `customerId` is "a numeric customer identifier" but does not define behavior for non-numeric values (string, null, undefined, NaN). Malformed input may cause confusing database errors that propagate unhandled.
  - **Recommendation:** Add an explicit precondition: `customerId` must be a positive integer. Reference OWASP Input Validation (WSTG-INPV-01).

- **SEC-2** | `warning` | secrets — Five credential env vars are listed as infra requirements but no statement about fallback defaults. If `lib/db.mjs` falls back to hardcoded defaults, credentials could leak into CI logs.
  - **Recommendation:** State that no default credentials are permitted; all env vars are required at startup with a configuration error if absent.

- **SEC-3** | `suggestion` | data-exposure — Returns all columns from the `orders` table. A `SELECT *` or unbounded column list would silently include new sensitive fields if the schema evolves.
  - **Recommendation:** Enumerate an explicit, fixed column list in the behavioral contract.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-2** | `warning` | contract — Acceptance Criterion 3 asserts `created_at` returns a JavaScript `Date`, but this depends on default `pg` type parser behavior for `TIMESTAMPTZ`. Not explicitly stated as a contract dependency. Unresolved from revision 1 review.
  - **Recommendation:** Add a note: "Assumes default `pg` type parser — `TIMESTAMPTZ` returns `Date` without custom `pg.types` overrides."

- **CON-3** | `suggestion` | pattern — Sibling spec `revenue-by-customer.md` defers to this spec for test contract rules via "same rules as customer-orders.md." If this spec's test rules change, the sibling's inherited rules silently diverge.
  - **Recommendation:** Consider extracting shared integration test rules into the charter when a third spec is added.

- **CON-4** | `warning` | domain-model — Spec returns order-table columns only but does not explicitly state that customer fields (name, email from charter's Domain Model) are excluded. Unresolved from revision 1 review.
  - **Recommendation:** Add a clarifying note: "Returns order-table columns only; customer fields are not joined."

- **CON-5** | `suggestion` | terminology — This spec defines an error propagation clause ("database errors propagate as-is") but the sibling spec `revenue-by-customer.md` has no equivalent clause.
  - **Recommendation:** No change needed in this spec. Consider adding a matching clause to the sibling for symmetry.

---

## Summary

**Total findings:** 10 (0 blockers, 5 warnings, 5 suggestions)
**Action required:** Spec passes review and is ready for planning. Consider addressing warnings before or during implementation.
