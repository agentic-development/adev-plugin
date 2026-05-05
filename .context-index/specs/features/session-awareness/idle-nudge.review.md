# Architecture Review: idle-nudge

> **Date:** 2026-04-06
> **Spec:** .context-index/specs/features/session-awareness/idle-nudge.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 7d4287152a8a1a918e954ea2af557fe89cf660ae

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-4** (warning) — **Behavior 3:** Stale execution state (active but no in_progress issues) triggers a warning but the spec does not clarify whether `clearExecutionState` should be called to self-heal. **Recommendation:** State explicitly: "The hook does NOT auto-clear stale state; it only warns."

- **SA-5** (suggestion) — **Behavior 1:** "up to 3 open issues by priority" does not define tiebreaker sort order when priorities are equal. **Recommendation:** Add: "sorted by priority ascending, then by issue ID ascending" or similar.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-4** (suggestion) — **Data Exposure:** Nudge surfaces up to 3 open issue titles and priorities into `additionalContext`. Same concern as SEC-2 on issue-reminder-hook — issue content enters model context. Acceptable for local CLI.

- **SEC-5** (suggestion) — **Data Exposure:** Stale execution state warning discloses prior session task info. Intentional by design and benign in local single-user context.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-4** (suggestion) — **Contract (Behavior delegation):** The cross-spec delegation from issue-reminder-hook Behavior 5 to idle-nudge is mentioned but not detailed. **Recommendation:** Add explicit cross-reference in issue-reminder-hook.md for implementation clarity.

- **CON-5** (suggestion) — **Domain Model (Behavior 3):** Stale state detection couples issue board state with execution state. The behavior is sound but could clarify that the warning is informational — it helps the agent identify drift, not trigger auto-correction.

## Domain Specialists

No specialists registered. No domain specialist reviews dispatched.

---

## Summary

**Total findings:** 6 (0 blockers, 1 warning, 5 suggestions)
**Action required:** Address SA-4 (clarify no auto-clear on stale state). Other findings are minor.
