---
name: adev-validate
description: Post-implementation validation. Checks that completed work satisfies the Live Spec's acceptance criteria, passes constitutional quality gates, and does not introduce drift.
---

# Validate Implementation

Run post-implementation checks against specs, constitution, and quality gates.

Full implementation pending. See design doc Part 3, Phase 3.

## Process

1. **Load spec:** Read the Live Spec that was implemented.
2. **Acceptance criteria check:** Walk through each acceptance criterion in the spec and verify it is satisfied by the implementation (tests exist, behavior confirmed).
3. **Constitution compliance:** Run all quality gate commands defined in the constitution:
   - Test suite passes
   - Linter passes
   - Type checker passes
   - Any custom gates
4. **Drift detection:** Compare the implementation against the spec's behavioral contract. Flag any deviations (extra endpoints, missing error handling, changed contracts).
5. **Coverage report:** Check test coverage for files touched by the implementation.
6. **Output:** Write validation report to `.context-kit/specs/features/<module>/<spec-slug>-validation.md` with pass/fail status and findings.

## Arguments

- `--spec <path>`: validate against a specific spec (required)
- `--fix`: attempt to auto-fix minor issues (missing tests, lint errors)
