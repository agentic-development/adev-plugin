# Architecture Review: unified-gate-system

> **Date:** 2026-04-15
> **Spec:** .context-index/specs/features/unified-gates/unified-gate-system.md
> **Charter:** .context-index/specs/features/unified-gates/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 2
> **file-sha:** 5dc8c8e3403835431c755a835515dd99b5f27c1f

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning, Behavior 10): "Warning-severity tier" phrasing was ambiguous — severity is per-gate, not per-tier. **FIXED:** Rephrased to "gate with severity: warning."
- **SA-2** (warning, Behavior 1): `group` field missing from canonical field list. **FIXED:** Added `group` (e2e-only) to field list.
- **SA-3** (suggestion, Behavior 9): Hard coupling to validate check numbering. Accepted as-is — check numbers are stable within the validate skill and referenced by other specs.
- **SA-4** (blocker, Behavior 9): Mixed-severity intra-tier fail-fast undefined. **FIXED:** Added explicit behavior: error-severity failure skips all remaining gates in tier regardless of their individual severity, with status `skip`.
- **SA-5** (warning, Behavior 6): "must not" vs WARN contradiction for probabilistic gates with commands. **FIXED:** Changed to "should not" with graceful degradation (command ignored, WARN emitted).
- **SA-6** (suggestion, Behavior 24): Whether `warn` status satisfies `required_gates`. Deferred to implementation — accepted as advisory.
- **SA-7** (suggestion): YAML parsing by LLM consistent with Principle 2. No change needed.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning, input-validation): Trust boundary for gate commands underspecified in multi-contributor repos. Accepted as advisory — gate commands execute with local user permissions by design. Projects should restrict write access via CODEOWNERS.
- **SEC-2** (warning, data-exposure): Gate output in reports may contain secrets. Accepted as advisory — truncation is last 8 KB, gate authors responsible for output hygiene.
- **SEC-3** (suggestion, secrets): `triggers` field schema undefined. Deferred — triggers are consumed by skills as lifecycle event names, not external URLs.
- **SEC-4** (suggestion, input-validation): Symlink traversal edge case. Low risk for developer-authored VCS config files.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (blocker): Superseded specs still contain conflicting precedence logic. **ALREADY RESOLVED:** All 5 tiered-test-gates specs marked `status: superseded` before review.
- **CON-2** (warning): `TierConfig` naming drift. Accepted — unified spec intentionally avoids runtime object naming per Principle 2.
- **CON-3** (warning): `required` (gate boolean) vs `required_gates` (transition list) terminology proximity. Accepted — distinct contexts, no ambiguity in usage.
- **CON-4** (blocker): Migration path for existing projects unclear. **FIXED:** Added Behavior 23b for `/adev:init` migration detection.
- **CON-5** (warning): Missing invalid `tier` error case. **FIXED:** Added error case row.
- **CON-6** (suggestion): Model routing `tier` terminology overlap. Accepted — different domains, no conflict.
- **CON-7** (warning): Missing single-task re-run acceptance criterion. **FIXED:** Added criterion.

---

## Summary

**Total findings:** 18 (2 blockers fixed, 8 warnings, 8 suggestions)
**Action required:** All blockers resolved. Spec is ready for planning with advisory notes.
