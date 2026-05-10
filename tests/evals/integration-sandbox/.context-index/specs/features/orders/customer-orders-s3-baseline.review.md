# Spec Review: Customer Orders Query

**Spec**: customer-orders.md
**Reviewer**: Strategy #3 Baseline
**Iterations**: 3
**Final Verdict**: PASS

## Iteration 1 - Initial Review

### Findings

1. **Behavioral contract gap (Medium)**: No input/output/error semantics documented. The contract only described the happy path query behavior without specifying what `customerId` is, what the output shape looks like, or how errors propagate. **Fixed**: Added structured input, output, and error propagation bullets to the Behavioral Contract section.

2. **AC4 testability unclear (Low)**: Acceptance criterion 4 (parameterized query) stated a requirement but not how to verify it. Parameterization is not observable from query results alone. **Fixed**: Added verification method — read source of `getOrdersByCustomer` and assert query string contains `$1` with no string concatenation.

3. **No teardown failure handling (Low)**: The required patterns mention `closePool()` in `after()` but do not address what happens if teardown itself fails. **Not fixed**: This is standard test runner behavior (after-hook failures surface as test failures). No spec change needed.

## Iteration 2 - Post-Fix Review

### Findings

1. **Revision not bumped (Low)**: Frontmatter `revision: 1` was stale after substantive edits to the behavioral contract and AC4. **Fixed**: Bumped to `revision: 2`.

2. **AC4 static vs integration tension (Informational)**: AC4 verification via source inspection is technically a static check within an integration test strategy. Acceptable since it complements the core integration criteria (AC1-3, AC5) and SQL injection protection cannot be verified through query results alone.

## Iteration 3 - Final Review

No new findings. All prior fixes verified in place.

## Constitution Compliance

| Principle | Status |
|---|---|
| Real database tests | Compliant - explicitly required in Test Requirements |
| Fail hard when infra offline | Compliant - explicitly stated, skip guards prohibited |
| Deterministic seed data | Compliant - AC5 references specific seed data values |
| Pure ESM | N/A at spec level (project-wide concern) |
| Clean teardown | Compliant - `after()` with `closePool()` required |

## Summary

The spec is well-structured and constitution-compliant. Two substantive improvements were made: (1) the behavioral contract now documents input, output, and error propagation semantics, and (2) AC4 now includes a concrete verification method. The spec is ready for planning.
