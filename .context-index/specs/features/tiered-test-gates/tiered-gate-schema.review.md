# Architecture Review: tiered-gate-schema

> **Date:** 2026-04-14
> **Spec:** .context-index/specs/features/tiered-test-gates/tiered-gate-schema.spec.md
> **Charter:** .context-index/specs/features/tiered-test-gates/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2

## Structural Architect

**Verdict:** PASS_WITH_NOTES

Initial review found 1 blocker (SA-1: asymmetric E2E schema), 3 warnings (SA-2: TierConfig availability, SA-3: governance interaction, SA-4: implement integration behavior), and 2 suggestions. All resolved in revision 2.

Remaining observations (non-blocking):
- SA-5 (warning): E2E sub-key severity override — Behavior 3 applies at tier level; spec does not explicitly confirm sub-key-level severity overrides. Recommend clarifying during planning.
- SA-6 (observation): Behavior 8 edge case for nested non-tier objects unlikely in practice.

## Security Reviewer

**Verdict:** PASS

- SEC-1 (warning): Gate command format — **Resolved** in revision 2. New "Gate Command Format" section clarifies commands are shell strings passed to child_process, consistent with existing behavior. Manifest is trusted developer-authored config.
- SEC-2 (suggestion): Parse error verbosity — Noted but acceptable for local CLI context.
- SEC-3 (suggestion): Mixed-key warning enumeration — **Resolved** in Behavior 7, which now lists ignored keys.
- SEC-4 (suggestion): Unbounded tier count — Low risk for local CLI. Not blocking.

## Consistency Analyzer

**Verdict:** PASS

- CON-1 (warning): PascalCase entity names — Consistent with all other charters. No change needed.
- CON-2 (warning): Gate tiers vs model tiers — Orthogonal domains, no conflict.
- CON-3 (suggestion): Template file reference — **Resolved** in Task Map which now explicitly references `templates/manifest.yaml`.
- CON-4 (suggestion): Terminology clarity between gate tiers and model tiers — Minor, non-blocking.

---

## Summary

**Total findings:** 0 blockers, 1 warning (SA-5), 4 suggestions
**Action required:** Spec is ready for planning. SA-5 (sub-key severity override) can be clarified during plan decomposition.
