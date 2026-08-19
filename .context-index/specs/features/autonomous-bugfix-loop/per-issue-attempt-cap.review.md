---
last-reviewed-revision: 1
file-sha: 693ee7d7a7bd90aa654a7d5043aa6b43840d0efc38e50c4282c826aafcdc81c9
---

# Architecture Review: per-issue-attempt-cap

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Verdict:** BLOCK
> **Rigor tier:** full

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |
| referent-integrity | Referent Integrity Reviewer | subagent | reviewer-reasoning | plugin:review-specs/referent-integrity-prompt.md |
| wiring-reviewer | Wiring Reviewer | subagent | reviewer-capable | plugin:review-specs/wiring-reviewer-prompt.md |
| boundary-reviewer | Boundary Reviewer | subagent | reviewer-capable | plugin:review-specs/boundary-reviewer-prompt.md |
| termination-reviewer | Termination Reviewer | subagent | reviewer-fast | plugin:review-specs/termination-reviewer-prompt.md |

## Disabled Reviewers

| ID | Reason |
|----|--------|
| structural-architect | Disabled as part of the reviewer-domain-fit initiative. OWASP/structural scope was retargeted to referent-integrity/wiring-reviewer/consistency-analyzer/boundary-reviewer for the default (Node CLI/plugin) project shape. |
| security-reviewer | Disabled as part of the reviewer-domain-fit initiative. OWASP-scoped review relocated to the web-service domain extension. |

## Consistency Analyzer (consistency-analyzer)

**Verdict:** FAIL

- **CON-1** [blocker] (contract, `behaviors-4`): This spec's BEH-4 requires excluding NO_PROGRESS/REGRESSED/BUDGET_EXHAUSTED, but the consuming bug-selection-and-eligibility spec BEH-5 only excludes on attempts>=cap or BUDGET_EXHAUSTED.
- **CON-2** [warning] (naming, `preconditions`): Neither this spec nor its sibling names the actual manifest key path for the attempt cap config.
- **CON-3** [suggestion] (pattern, `error-cases`): NO_STABLE_CHECK_IDS degraded mode assumption overlaps terminology with check-id-enum.spec.md's documented check-ID instability without citing it.
- **CON-4** [warning] (adr-compliance, `postconditions`): New artifact family (bugfix-loop-attempts.jsonl) introduced into lifecycle-state/ without adding an entry to ADR-0015's Decision-section ownership table as that ADR requires.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS_WITH_NOTES

- **RI-10** [warning] (undisclosed-dependency, `behaviors`): --auto flag itself (not just the check-ID output shape) does not exist in skills/debug/SKILL.md today and is not disclosed as a forward dependency on the sibling spec, unlike the check-ID requirement which is disclosed.
- **RI-11** [warning] (ambiguous-citation, `preconditions`): manifest.yaml has two conflicting top-level build: blocks with different max_review_retries values (9 vs 2), making the "existing default (2)" citation ambiguous.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [blocker] (no-caller, `behaviors-1`): The AttemptRecord write itself has no named caller anywhere — /adev:debug explicitly has no awareness of it (BEH-7), and bugfix-loop-skill's Output Contract never invokes a write step.
- **WR-2** [blocker] (write-only-state, `behaviors-2`): curr_blockers must be persisted for reuse as the next attempt's prev_blockers (BEH-2), but the AttemptRecord schema has no field for it.
- **WR-3** [blocker] (write-only-state, `behaviors-3`): parked_reason is written (BEH-3) but never read by anything in this spec or its siblings.
- **WR-4** [warning] (untested-path, `behaviors-4`): AttemptRecord write-to-selection-exclusion path is wired in prose but has no end-to-end integration test.
- **WR-5** [warning] (unnamed-key, `preconditions`): The manifest config key for the attempt cap is never named as a concrete key path.
- **WR-6** [warning] (unfulfilled-dependency, `preconditions`): Stable check-ID producer is named as living in debug-completion-and-auto Phase 6 step 1, but that sibling spec has no such structured-output requirement.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-6** [blocker] (artifact-leakage, `error-cases`): NO_STABLE_CHECK_IDS degraded-mode fallback requires comparing prior raw quality-gate output across self-re-invoked turns with fresh context, but never defines what gets persisted (raw text vs bounded hash) to the git-tracked JSONL.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1** [blocker] (missing-cap-trip-verdict, `behaviors-2`): BEH-2 gates evaluateStopCondition on "if a prior attempt exists" — with cap=1 and a first-attempt PARKED outcome, retries_remaining<=0 already holds but the verdict computation is skipped, leaving last_verdict unset rather than BUDGET_EXHAUSTED.

---

## Summary

**Total findings:** 14 (6 blockers, 7 warnings, 1 suggestions)
**Action required:** Address the 6 blocker(s) listed above and in the accompanying `.blockers.md` sidecar, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/per-issue-attempt-cap.spec.md` to produce revision 2, and re-review.
