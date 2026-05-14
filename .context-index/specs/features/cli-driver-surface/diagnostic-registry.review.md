---
spec: .context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md
charter: .context-index/specs/features/cli-driver-surface/charter.md
date: 2026-05-14
verdict: PASS_WITH_NOTES
last-reviewed-revision: 1
file-sha: 83a2db8a7ff9c7498c772fbe6d6171ce40430ecd554b8f93119df08de3c9817a
---

# Architecture Review: diagnostic-registry

> **Date:** 2026-05-14
> **Spec:** `.context-index/specs/features/cli-driver-surface/diagnostic-registry.spec.md`
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES (initial: BLOCK; blocker resolved inline by spec author post-review)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|---|---|---|---|---|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning): Duplicate-id policy ("last wins") silently mutates behavior based on YAML order; contradicts fail-safe spirit. **Status:** Deferred — `/adev:plan` task to revisit policy; suggested change is "first wins, second to errors" or "both to errors."
- **SA-2** (warning): `runner` field resolution root (relative to `projectRoot` vs. plugin vs. repo) unspecified. **Resolution:** Behavior 2 updated — runner paths resolve relative to `projectRoot`, bundled runners use `plugin:` prefix.
- **SA-3** (suggestion): `runDiagnostics` signature lacks explicit parameter types/optionality; `event` parameter passed by hook spec not declared here. **Status:** Deferred — interface alignment captured cross-spec in resolution of write-time-diagnostic-hook CON-2.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning, input-validation): Runner path traversal — arbitrary paths in `governance/diagnostics.yaml` could load files outside project root via dynamic import. **Resolution:** Behavior 2 strengthened — engine asserts runner path is contained within `projectRoot` or plugin root; out-of-bounds paths treated as `SCHEMA_INVALID` and never imported. Mirrors `lifecycle-event-log` path-safety pattern.
- **SEC-2** (suggestion, input-validation): Event payload size unbounded for `event-schema-valid` runner. **Status:** Deferred — upstream `lifecycle-event-log` `EVENT_TOO_LARGE` guard (1 MB) provides the cap. Cross-reference noted.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES (initial: BLOCK)

- **CON-1** (blocker, contract): `event-schema-valid` Behavior 7 required field `timestamp` conflicts with `lifecycle-event-log.spec.md` canonical field `ts`. Would reject all real events as malformed. **Resolution:** Behavior 7 updated — required field changed to `ts`, citation added to lifecycle-event-log as canonical source.
- **CON-2** (warning, naming): Tier-1 runner path `lib/diagnostics/tier1/<id-stem>.mjs` (this spec) conflicts with charter Domain Model `lib/cli/diagnostics/<id>.mjs`. **Status:** Deferred — charter Domain Model row will be updated in a follow-up charter revision; spec wording is authoritative.
- **CON-3** (suggestion, naming): `errors[].reason` uses kebab-case `'schema-invalid'` while sibling specs use SCREAMING_SNAKE_CASE. **Resolution:** Behavior 2 updated to use `SCHEMA_INVALID`.

---

## Summary

**Total findings:** 8 (1 blocker resolved, 3 warnings, 4 suggestions/deferred)
**Initial verdict:** BLOCK
**Post-resolution verdict:** PASS_WITH_NOTES (blocker resolved, 2 warnings + 1 suggestion resolved inline)
**Action required:** Spec ready for `/adev:plan`. Deferred items become plan tasks.
