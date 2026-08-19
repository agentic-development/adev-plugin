---
last-reviewed-revision: 1
file-sha: def8b4fd84358316f59ca1ecc428707e659a19d1031d84b4c15cefb85c33043e
---

# Architecture Review: tracker-provider-bridge

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md
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

- **CON-1** [blocker] (contract, `acceptance-criteria`): Acceptance criteria claim "interface alone" is sufficient for extensibility, but the charter requires interface AND registry; no registry component appears anywhere in this spec.
- **CON-2** [warning] (adr-compliance, `interaction-contract`): TrackerSyncLink storage path/format is never declared, unlike the sibling per-issue-attempt-cap spec which properly cites ADR-0015.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1** [blocker] (mischaracterized-prior-art, `system-constitution-reference`): lib/milestones.mjs's gh usage is cited as "existing read-only PR-visibility usage" but is unreachable in production — no default execGh injector exists and no caller ever supplies one.
- **RI-2** [blocker] (weakened-boundary-justification, `system-constitution-reference`): The "Architecture Boundary: Not triggered" conclusion for skipping human approval on the gh dependency rests partly on the RI-1 mischaracterization, leaving only one (not two) verified prior-art precedents.
- **RI-7** [suggestion] (forward-reference, `participants`): /adev:bugfix-loop --github-sync does not exist yet; correctly self-consistent forward reference to sibling in-flight work, not a factual gap.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [blocker] (no-caller, `interaction-contract-outbound-writeback`): The "claimed" outcome branch of outbound writeback is unreachable — bugfix-loop-skill's actual call sequence never invokes writeback between claim and the debug attempt.
- **WR-2** [blocker] (write-only-state, `interaction-contract-outbound-writeback`): last_synced_at and last_comment_id are written every writeback but never read by anything.
- **WR-3** [suggestion] (implicit-mechanism, `interaction-contract-outbound-writeback`): WorkItem-to-TrackerSyncLink reverse lookup mechanism is implied but never stated explicitly.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1** [blocker] (input-trust, `interaction-contract`): Inbound GitHub issue title/body flows unvalidated into IssueManager.create with no length/content check, later becoming /adev:debug --auto's investigation target — the bug+help-wanted label gate is a triage boundary, not a content-safety boundary.
- **BD-2** [warning] (artifact-leakage, `interaction-contract`): Same unvalidated title/body becomes a persisted, git-committed artifact with no stated escaping for the backend's serialization format.
- **BD-3** [blocker] (privilege-escalation, `interaction-contract`): "Never changes GitHub issue state/labels/assignees" is asserted in prose only; the TrackerProviderAdapter interface itself grants unscoped writeback capability rather than a narrow postComment()-shaped method.
- **BD-4** [warning] (subprocess-interpolation, `interaction-contract`): gh issue comment invocation is not required to use an argv array, despite comment text potentially referencing externally-sourced WorkItem titles.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1** [blocker] (missing-iteration-cap, `error-propagation`): Inbound-sync degrade-and-retry-next-turn on GitHub unreachability has no bound on consecutive degraded turns and no escalation path if GitHub stays unreachable indefinitely.
- **TR-2** [suggestion] (clarity, `error-propagation`): Outbound-writeback skip-on-unreachability row is fully specified; minor phrasing consolidation suggested only.

---

## Summary

**Total findings:** 14 (8 blockers, 3 warnings, 3 suggestions)
**Action required:** Address the 8 blocker(s) listed above and in the accompanying `.blockers.md` sidecar, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/tracker-provider-bridge.spec.md` to produce revision 2, and re-review.
