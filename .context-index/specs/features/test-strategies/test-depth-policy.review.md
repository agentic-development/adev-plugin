# Architecture Review: test-depth-policy (revision 7, round 10 — FINAL)

> **Date:** 2026-08-11
> **Spec:** .context-index/specs/features/test-strategies/test-depth-policy.spec.md
> **Charter:** .context-index/specs/features/test-strategies/charter.md
> **Rigor tier:** full (explicit `--tier full`; risk_level `medium` → `review_mode: full`)
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 7
> **file-sha:** 0fb520e3a9b81c4c51d494d599d72addb89de790232fed877436912a4ae1cc96

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Verdicts

| Reviewer | Verdict | Findings |
|---|---|---|
| Structural Architect | PASS_WITH_NOTES | SA-49 RESOLVED (empirical corpus sweep: zero false positives across 1,013 body / 809 context headings); 1 warning (SA-50), 1 suggestion (SA-51) |
| Security Reviewer | **PASS** | No findings. SEC-35 RESOLVED; regex adopted verbatim; round-9 exhibits re-verified; no regressions across all resolved findings |
| Consistency Analyzer | PASS_WITH_NOTES | CON-54 RESOLVED; structure intact; error-code and behavior↔AC coverage closed both ways; 1 suggestion (CON-55) |

**Consolidated verdict: PASS_WITH_NOTES** (warnings present, zero blockers).

## Round-10 Notes — applied at finalization

All three notes carried one-clause fixes, applied in the same finalization commit:

- **SA-50 (warning):** `<N>` in the task-region mapping was unpinned against Behavior 12's
  permissive `--task-id` grammar; suffixed headings (`### Task 9b:`) were invisible to the
  scanner and their paths absorbed by the enclosing numeric task (monotone-safe direction,
  two corpus hits, neither touching a sensitive path). Fixed: `<N>` pinned to `\d+`,
  suffixed/ranged forms declared out of the mapping's contract with visible degradation,
  plus an AC.
- **SA-51 (suggestion):** five pre-convention plans title their context-packet headings
  freely and degrade wholesale — the specified behaviour, now recorded as a Known
  Limitation.
- **CON-55 (suggestion):** plural `Tasks 10-14 Context` headings fail the `Task <N>`
  pattern outright and sat outside the iff-definition's domain; a clause now states they
  are never task-body headings under either family.

## Blocker History

Rounds 1–10: 8 → 7 → 6 → 4 → 10 → 7 → (r7) 2 → (r8) 1 → (r9) 1 → **0**.

Every blocker across ten rounds is resolved. The final three rounds converged on one
component — the plan-task file reader's region mapping — with each fix empirically
verified against the shipped plan corpus before being committed, and the round-10
structural sweep confirming zero false positives corpus-wide.

## Standing References

- Enforcement follow-on: issue-559 (shared task board, main repo `tasks.json`).
- Charter revision 3 must land with the plan (capability row, Out of Scope qualifier,
  governance dependency, `TestDepthAssignment` entity, `test_depth` Consumed-API row);
  this spec's `charter-revision:` bumps to 3 at that point.
- The parent charter has no capability row for this spec yet (`charter-extension: true`),
  so the Step 7 Capability Map update is deferred to that charter revision.

**Next step:** `/adev:plan --spec .context-index/specs/features/test-strategies/test-depth-policy.spec.md`

**Approver role (informational):** no `spec-to-plan` transition approver configured in `governance/gates.yaml`.
