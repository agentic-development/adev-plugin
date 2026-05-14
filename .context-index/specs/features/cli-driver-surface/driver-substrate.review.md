---
spec: .context-index/specs/features/cli-driver-surface/driver-substrate.spec.md
charter: .context-index/specs/features/cli-driver-surface/charter.md
date: 2026-05-14
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 9e22d8fdd9aa24d50dd1886d66a8d519bd672760adfd25992c79a00bb945ba08
---

# Architecture Review: driver-substrate

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/driver-substrate.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES (initial: PASS_WITH_NOTES; 3 warnings addressed inline by spec author post-review)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|---|---|---|---|---|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning): Postcondition 1 asserts `gate.mjs::run`'s first statement is `requireGate(...)`, but `gate.mjs` is a query primitive, not a lifecycle step. The `LIFECYCLE_STEP` export convention determines whether the pattern test enforces this. **Resolution:** Behavior 2 was strengthened to declare `LIFECYCLE_STEP` is an optional export; `gate.mjs` explicitly does NOT export it.
- **SA-2** (suggestion): Skill-to-step mapping for `adev gate require --skill <name>` is implicit. **Status:** Deferred — implementation detail; carried into `/adev:plan` task description.
- **SA-3** (suggestion): Behavior 9 (`--help` dispatch) is a dispatcher-level behavior; testing location ambiguous. **Status:** Deferred — testing location decision belongs in `/adev:plan` task breakdown.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning, input-validation): `--spec <path>` accepted without path-containment check; pattern propagates to all extracted helpers. **Status:** Deferred — path-containment is addressed in `adev-diagnose-cli` Behavior 2 (the canonical helper for spec-path arguments); other helpers SHOULD adopt the same pattern. This spec accepts the spec-path pattern; `/adev:plan` will include a task to add containment check to `lib/cli/gate.mjs`.
- **SEC-2** (suggestion, input-validation): Verb names in error messages not sanitized. **Status:** Deferred — low practical risk; cosmetic. Implementation may include printable-ASCII stripping.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning, contract): `cli` charter rev-3 precondition is OR-conditional, allowing implementation to proceed while charter is still rev-2. **Resolution:** Precondition 4 rewritten as a hard prerequisite — rev 3 must land first via separate PR.
- **CON-2** (warning, contract): `help()` fallback to argv-schema is unspecified. **Resolution:** Behaviors 2 and 9 reworked — `help()` is mandatory on every `lib/cli/<verb>.mjs`; pattern test asserts both `run` and `help` exports; no fallback exists.
- **CON-3** (suggestion, naming): `LIFECYCLE_STEP` export convention not in charter Domain Model. **Status:** Deferred — charter follow-up via `/adev:hygiene` or charter revision.
- **CON-4** (suggestion, pattern): `state` parameter passed in vs. obtained internally by helper unclear. **Status:** Deferred — implementation detail; convention will be set by first helper (likely "load internally").

---

## Summary

**Total findings:** 9 (0 blockers, 4 warnings, 5 suggestions)
**Initial verdict:** PASS_WITH_NOTES
**Post-resolution verdict:** PASS_WITH_NOTES (3 warnings resolved inline by spec edits; 1 warning + 5 suggestions deferred to `/adev:plan` tasks or follow-up specs)
**Action required:** Spec ready for `/adev:plan`. Deferred items will appear as plan tasks during decomposition.
