---
last-reviewed-revision: 1
file-sha: 860b35314c597076c90ebf62fbfa9f023301ec4ea7de446ca40501e270e85936
---

# Architecture Review: bug-selection-and-eligibility

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md
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

- **CON-1** [blocker] (contract, `behaviors-5`): BEH-5 excludes only on attempts>=cap or last_verdict:BUDGET_EXHAUSTED, omitting NO_PROGRESS/REGRESSED which the sibling per-issue-attempt-cap spec BEH-4 requires be excluded too.
- **CON-2** [blocker] (domain-model, `behaviors-8`): P0-P4 string vocabulary for --max-priority has no defined mapping to WorkItem.priority, which is numeric 0-4 in the actual IssueManagerInterface/task-management domain model.
- **CON-3** [blocker] (module-boundary, `behaviors-7`): Excluded-module safety list (review gate, convergence detector, retry loop) cannot be expressed at manifest.yaml modules[] granularity; the lib slug covers all of lib/ including unrelated code.
- **CON-4** [warning] (naming, `error-cases`): INVALID_TYPE error code collides with an existing, semantically different error code already thrown by lib/issues/interface.mjs.
- **CON-5** [suggestion] (domain-model, `behaviors-6`): Module-association field (notes/source-manifest/module tag) is not part of WorkItem domain model documented anywhere.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** PASS

No findings.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [blocker] (unresolvable-input, `behaviors-6`): No producer exists anywhere for the module-association value BEH-6/BEH-7 consume; no Issue field, no resolveModule(issue) function exists in the repo.
- **WR-2** [warning] (untested-path, `behaviors`): adev issues next -> bugfix-loop-skill call path is named on both ends but has no end-to-end test.
- **WR-3** [warning] (unconcrete-default, `behaviors-7`): Default excluded_modules value is described only in prose, not as concrete manifest slugs; manifest granularity cannot cleanly isolate the intended sensitive modules.
- **WR-4** [warning] (untested-path, `preconditions`): AttemptRecord write (sibling spec) to read (this spec BEH-5) path is named on both ends but unverified end to end.
- **WR-5** [suggestion] (unnamed-consumer, `error-cases`): Individual error code values (ISSUE_BOARD_NOT_CONFIGURED etc) have no named consumer beyond generic non-zero exit handling.
- **WR-6** [suggestion] (implicit-reference, `preconditions`): Precondition names the lifecycle-state/ directory but not the specific file (bugfix-loop-attempts.jsonl) the sibling spec establishes.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** PASS_WITH_NOTES

- **BD-1** [warning] (input-trust, `behaviors-7`): Module-tag/association value that gates the safety boundary is not pinned to a verifiable, code-linked source; could originate from externally-authored content via the GitHub bridge.
- **BD-2** [suggestion] (privilege-posture, `error-cases`): No behavior asserts the excluded-module default resolves non-empty at load time; could silently degrade to an empty exclusion list.

## Termination Reviewer (termination-reviewer)

**Verdict:** PASS

No findings.

---

## Summary

**Total findings:** 13 (4 blockers, 5 warnings, 4 suggestions)
**Action required:** Address the 4 blocker(s) listed above and in the accompanying `.blockers.md` sidecar, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md` to produce revision 2, and re-review.
