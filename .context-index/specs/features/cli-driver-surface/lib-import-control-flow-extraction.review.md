---
last-reviewed-revision: 2
file-sha: 220cc1dfa6294c7e7ad2baa0491c0ed09a9f8dcfcee15b78a2731b1c29e6e8bd
---

# Architecture Review: lib-import-control-flow-extraction

> **Date:** 2026-05-17
> **Spec:** `.context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md` (rev 2)
> **Charter:** `.context-index/specs/features/cli-driver-surface/charter.md`
> **Verdict:** PASS_WITH_NOTES (rev 1 had 2 warnings + 1 high-severity typo; all resolved in rev 2 before finalising review)

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | `plugin:review-specs/structural-architect-prompt.md` |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | `plugin:review-specs/security-reviewer-prompt.md` |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | `plugin:review-specs/consistency-analyzer-prompt.md` |

## Structural Architect

**Rev 1 verdict:** PASS_WITH_NOTES — 6 findings (2 warnings, 4 suggestions).

| ID | Severity | Status in rev 2 |
|---|---|---|
| SA-1 | suggestion | **Resolved.** Site inventory rewritten to group by 3 categories (A: task-selection lookup, B: status-transition emissions, C: re-plan-detection); each category names a canonical owner and mirrors. Total citation count reconciled. |
| SA-2 | warning | **Resolved.** Behavior §1 now explicitly states the import-shape grep is the minimum signal; reviewer-side scan for control-flow tokens inside fenced JS is mandated as additional review-time discipline; mechanical detection of control-flow shape inside fenced JS is explicitly out of scope (deferred to `regression-prevention.spec.md`). |
| SA-3 | warning | **Resolved.** Target State rewritten as the audit's expected outcome, not premise. Step 1 (Audit) explicitly captures verbs-vs-arguments delta; verb-argument additions are explicitly permitted (Invariants), new verb entries explicitly forbidden. |
| SA-4 | suggestion | **No change required** — charter alignment was already clean. |
| SA-5 | suggestion | **Resolved.** Added explicit "Distinguishing acceptable agent-side lookup from a constitutional violation" paragraph to Target State, carving out the operator-cognitive lookup case. |
| SA-6 | suggestion | **Resolved.** Added Task Map entry "Capture audit findings in commit message" and matching acceptance criterion that names the deliverable. |

## Security Reviewer

**Verdict:** PASS (no findings).

Markdown-only refactor with no security surface. No new external systems, network calls, credentials, or input boundaries. The inline-Node forbidden-pattern test remains unchanged; the existing safety gate is preserved.

## Consistency Analyzer

**Rev 1 verdict:** PASS_WITH_NOTES — 6 findings (1 high, 1 medium, 4 low — using the analyzer's severity vocabulary; mapped to canonical warning/warning/suggestion×4).

| ID | Severity (mapped) | Status in rev 2 |
|---|---|---|
| CON-1 | warning (was "high") | **Resolved.** Acceptance-criteria grep typo fixed — `\|` → `|`. The check now correctly uses ERE alternation. Behaviors §1 already used the correct form. |
| CON-2 | warning (was "medium") | **Resolved.** Task Map entry reworded from "Add a new row" to "Update existing 'Lib-import control-flow extraction' row's `Status` column." Acceptance criterion updated to match. |
| CON-3 | suggestion | **No change required** — terminology was already consistent with the constitution clarification. |
| CON-4 | suggestion | **Resolved.** Migration Path text clarified: parent sweep's per-step invariant is scoped to inline-Node patterns and enforced by the hook; this spec's descriptive-JS discipline is a review-time check, not hook-enforced. Extension to the hook is explicitly deferred. |
| CON-5 | suggestion | **No change required** — sibling-spec terminal-state reference was already consistent. |
| CON-6 | suggestion | **Resolved.** Current State now explains that "~3" in the charter row refers to the three categories; total file:line count is ~5 across two files. |

---

## Summary

**Total findings:** 12 across rev 1 (2 warnings + 1 high-severity → 3 warnings after severity mapping, 9 suggestions, 0 blockers).

**Resolution:** Spec revised in rev 2 before review finalisation. All warnings addressed; suggestions either applied or explicitly declined with rationale. Final verdict: PASS_WITH_NOTES, suitable for promotion to `review-passed` and progression to `/adev:plan`.

**Action required:** None. Spec is ready for planning.
