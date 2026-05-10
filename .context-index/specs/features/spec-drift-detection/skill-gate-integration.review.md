# Architecture Review: skill-gate-integration

> **Date:** 2026-05-02
> **Spec:** .context-index/specs/features/spec-drift-detection/skill-gate-integration.spec.md
> **Charter:** .context-index/specs/features/spec-drift-detection/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** b0e9e3bb0335df19d485651a258be1b4257cc61f

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect

**Verdict:** PASS (after fix)

- **SA-6** (blocker, fixed): No recovery path on non-Claude-Code hosts when both `hasDrift()` and `verifyManifest()` fail. **Fixed:** added explicit CODE_DRIFT_VERIFY_ERROR behavior with recovery guidance (run /adev:hygiene or /adev:implement).
- **SA-7** (warning): SKILL.md files cannot call functions directly — clarification needed that instructions direct agent to invoke via inline Node.js. **Fixed:** updated constitution reference to clarify agent invocation model.
- **SA-8** (suggestion): Hygiene scan scope (all specs) not explicitly defined. Should match `.context-index/specs/**/*.md`.

## Security Reviewer

**Verdict:** PASS (after fix)

- **SEC-1** (blocker, fixed): Validate/hygiene fail-open on malformed frontmatter silently skips drift check. **Fixed:** now emits explicit "drift check skipped — frontmatter unreadable" warning.
- **SEC-2** (warning): Three-state model for `drift_detected` (true/false/absent) not specified — field absence vs. explicit false may produce different fallback behaviors.
- **SEC-3** (suggestion): INCOMPLETE_DRIFT should cover missing `drift_at` as well as missing `drift_source`. **Fixed:** error case now states "missing `drift_source` or `drift_at`".

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-4** (warning): Error code naming inconsistent — mix of `CODE_DRIFT`, `DRIFT_READ_ERROR`, `MANIFEST_VERIFY_ERROR`. **Fixed:** standardized to `CODE_DRIFT_*` prefix.
- **CON-5** (suggestion): Recovery path when `clearDrift()` fails during implement GREEN — next plan invocation would block on stale flag.
- **CON-6** (suggestion): Postcondition says "informed decisions without blocking" but plan gate actually blocks — intent alignment.

---

## Summary

**Total findings:** 10 (2 blockers fixed, 3 warnings, 5 suggestions)
**Action required:** Both blockers resolved in spec revision. Remaining warnings are advisory. Spec is ready for planning.
