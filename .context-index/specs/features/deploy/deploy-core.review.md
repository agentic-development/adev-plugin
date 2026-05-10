# Architecture Review: deploy-core

> **Date:** 2026-05-09
> **Spec:** .context-index/specs/features/deploy/deploy-core.spec.md
> **Charter:** .context-index/specs/features/deploy/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 3
> **file-sha:** 96174cafa5e9d94a781c8e75693d5237f916f6f5

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Previous Review (revision 2): Blockers Resolved

All 3 blockers from the revision 2 review are addressed:

- **SEC-1** (YAML parser injection): Spec now constrains parser to strict subset, rejects anchors/aliases/merge keys/tags with INVALID_CONFIG.
- **SEC-2** (secret detection underspecified): Spec defines 4 regex patterns with documented bypass limitations.
- **CON-1** (missing milestones dependency): Preconditions explicitly declare `lib/milestones.mjs` as a prerequisite; Task 9 blocked until available.

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- **SA-1** | `warning` | Behavior 4 (secret detection)
  The high-entropy regex `[A-Za-z0-9+/=_-]{32,}` will match legitimate values (checksums, UUIDs, package hashes). The spec documents false-negative limitations but not false-positive risk, and provides no suppression mechanism.
  **Recommendation:** Document false-positive risk alongside false-negative limitations. Consider specifying a suppression mechanism (per-step annotation or allowlist).

- **SA-2** | `suggestion` | Behavior 16 (output scrubbing)
  Scrubbing scope is ambiguous: does it cover only `variables` from deploy.yaml, the full process environment, or both?
  **Recommendation:** Clarify the scrubbing scope explicitly.

- **SA-3** | `suggestion` | Behaviors 10-11 (polling config)
  Gate and ci-trigger define configurable intervals/timeouts but don't specify where these live in the deploy.yaml step schema.
  **Recommendation:** State that interval/timeout are per-step fields in the step schema.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES

All 6 previous findings (SEC-1 through SEC-6) resolved. 3 new findings:

- **SEC-7** | `warning` | input-validation
  CI-trigger `command` outputs a job identifier to stdout consumed by `poll_command`. The spec doesn't constrain format, size, or sanitization of this value.
  **Recommendation:** Length-bound the job ID (e.g., 256 chars), strip control characters, and pass to poll_command via a defined mechanism (env var or argument), not shell interpolation.

- **SEC-8** | `warning` | data-exposure
  Postcondition "no secrets ever logged" is stronger than what Behavior 16 guarantees (only redacts declared env var values from deploy.yaml). Undeclared secrets in the process environment are not covered.
  **Recommendation:** Narrow postcondition to match actual guarantee ("no declared env var values are logged"), or explicitly state undeclared env vars are out of scope.

- **SEC-9** | `suggestion` | rate-limiting
  No maximum timeout ceiling. A misconfigured deploy.yaml could set arbitrarily large timeouts.
  **Recommendation:** Define maximum configurable timeouts (e.g., 3600s for gate, 7200s for ci-trigger).

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

Previous CON-1 blocker resolved. New findings:

- **CON-1** | `suggestion` | contract (reclassified from blocker)
  Charter exposes both `findMilestone` and `loadMilestones` from `lib/milestones.mjs`, but the spec only uses `loadMilestones` implicitly in Behavior 5. The `findMilestone` API is not consumed by this spec. *Reclassified from blocker: an unused charter API is a clarity issue, not an integration failure. The spec's Behavior 5 clearly defines milestone behavior.*
  **Recommendation:** Clarify in Behavior 5 which milestones.mjs function is called, or note that findMilestone is reserved for future specs.

- **CON-4** | `suggestion` | pattern
  Spec declares YAML safety constraints (reject anchors/aliases) in the Constitution Reference, but it's unclear whether `parseYaml` itself rejects these or `validateDeployConfig` does.
  **Recommendation:** Clarify in Task 1 that validateDeployConfig performs the YAML safety checks.

- **CON-6** | `warning` | contract
  Charter exposes `getDeployHistory(projectRoot)` as an API but the spec has no task for it. Deploy History is "Should-have" in the charter, outside this spec's Must-have scope.
  **Recommendation:** Update charter to move `getDeployHistory()` to a "Future APIs" section, or create a separate deploy-history spec.

---

## Summary

**Total findings:** 9 (0 blockers, 4 warnings, 5 suggestions)
**Action required:** Spec passes review. Warnings are non-blocking and can be addressed during planning or implementation. Proceed to `/adev:plan --spec .context-index/specs/features/deploy/deploy-core.spec.md`.
