# Architecture Review: issue-reminder-hook

> **Date:** 2026-04-06
> **Spec:** .context-index/specs/features/session-awareness/issue-reminder-hook.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 181053fdc742d968e8bbf03c347757a6409a0558

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — **Behavior 3, Git Commit Detection:** Substring match on "git commit" is brittle. False-positives on commands like `echo "git commit"` or `grep "git commit"`. False-negatives on `git -c user.name=x commit`. **Recommendation:** Document as a known limitation. The heuristic is pragmatic for low-risk but should acknowledge false-positive/negative scenarios.

- **SA-2** (suggestion) — **Behavior 5, Idle Nudge delegation:** The spec says "delegate to Idle Nudge behavior" but does not define the interface contract for delegation (function call, inline logic, separate module). **Recommendation:** Add a clarifying sentence on the delegation mechanism.

- **SA-3** (suggestion) — **Counter Mechanism:** The counter file path `.context-index/.reminder-counter` does not state whether it is resolved relative to project root or plugin root. **Recommendation:** Clarify that it is resolved relative to the project's `.context-index/` directory.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (suggestion) — **Input Validation:** The counter file contains a plain integer parsed from raw text. A corrupted file (e.g., `NaN` or extremely large number) could cause unexpected behavior. **Recommendation:** Parse with `parseInt()` and validate result is finite positive integer. Fall back to 0 on invalid parse. (Already covered by Behavior 8.)

- **SEC-2** (suggestion) — **Data Exposure:** `additionalContext` surfaces issue titles and execution state into Claude's context window. If titles contain sensitive references, they will appear in every reminder. **Recommendation:** Document that issue titles should not contain secrets. Acceptable for local CLI threat model.

- **SEC-3** (suggestion) — **Input Validation:** Git commit detection via substring match could false-positive. **Recommendation:** Consider tighter match (regex `\bgit commit\b`). Low impact — worst case is an extra reminder.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning) — **Contract (Behaviors 1-2):** The spec uses "configured interval" but does not explicitly reference `configurable-reminder-interval.md` as the source or state where the interval value comes from. **Recommendation:** Add to Preconditions a reference to `tasks.reminder_interval` from manifest and cross-reference `configurable-reminder-interval.md`.

- **CON-2** (suggestion) — **Pattern (.reminder-counter naming):** Counter file uses `-counter` suffix while similar flag files use `-ok` suffix. Current choice is descriptive and acceptable. **Recommendation:** No change needed; document naming intent.

- **CON-3** (suggestion) — **Contract (Behavior 4):** Does not state which backend adapters support `in_progress` status. **Recommendation:** Add note that all backends (file, beads) support `in_progress` status.

## Domain Specialists

No specialists registered. No domain specialist reviews dispatched.

---

## Summary

**Total findings:** 9 (0 blockers, 2 warnings, 7 suggestions)
**Action required:** Address SA-1 (git commit detection limitation) and CON-1 (interval source reference) before planning. Other findings are minor improvements.
