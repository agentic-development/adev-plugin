---
last-reviewed-revision: 1
file-sha: 4034c82d3e81aaa6be16fc32fa4d9201f9801db010b5e744174a374321426777
---

# Architecture Review: bugfix-loop-skill

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
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

- **CON-1** [blocker] (contract, `output-contract`): ADEV-BUGFIX-LOOP token does not match the pinned grammar ^ADEV-[A-Z]+: [A-Z_]+$ — the hyphen in BUGFIX-LOOP breaks the regex; no precedent for a hyphenated skill-name segment exists.
- **CON-2** [warning] (adr-compliance, `output-contract`): bugfix-loop-runs/<run_id>.json introduces a third lifecycle-state/ artifact shape not declared in ADR-0015's Decision table, unlike the sibling per-issue-attempt-cap spec which does cite it.
- **CON-3** [warning] (pattern, `invocation-modes`): New skill is never registered with /adev:work's routing table or the using-adev gateway listing, per single-front-door.spec.md.
- **CON-4** [suggestion] (domain-model, `arguments`): Charter's own illustrative example uses --max-priority P2 while both live specs converge on P3; charter example is stale.

## Referent Integrity Reviewer (referent-integrity)

**Verdict:** FAIL

- **RI-1** [blocker] (token-grammar-violation, `output-contract`): ADEV-BUGFIX-LOOP token does not satisfy the completion-tokens.spec.md grammar it claims to comply with.
- **RI-2** [warning] (incomplete-invocation, `output-contract`): adev issues claim/release calls omit the required --owner flag / ADEV_ISSUE_OWNER env var; as written the pipeline would exit 1 on every turn.
- **RI-4** [suggestion] (unclear-forward-reference, `output-contract`): Sibling specs for adev issues next / --auto / ADEV-DEBUG are not cited by name, so a reader cannot tell forward-declaration from invention.

## Wiring Reviewer (wiring-reviewer)

**Verdict:** FAIL

- **WR-1** [blocker] (no-caller, `output-contract`): AttemptRecord write (per-issue-attempt-cap's entire safety mechanism) has no invocation site in this orchestrator's call sequence.
- **WR-2** [blocker] (no-caller, `output-contract`): ADEV-BUGFIX-LOOP token literal does not match the grammar its own named consumer (/goal, completion-tokens.spec.md matcher) requires to recognize it.
- **WR-3** [warning] (untested-path, `invocation-modes`): BugfixLoopRun state write-then-resume-read round trip has no named test.
- **WR-4** [warning] (ambiguous-interaction, `output-contract`): This spec's adev issues claim and /adev:debug's own internal Phase 1.6 claim both fire for the same issue; idempotent-renewal vs conflict behavior is unstated.
- **WR-5** [warning] (untested-path, `output-contract`): GitHub sync inbound/outbound call sites are named consistently with the sibling bridge spec but have no integration test tracing this spec's specific call positions.

## Boundary Reviewer (boundary-reviewer)

**Verdict:** FAIL

- **BD-1** [warning] (path-containment, `output-contract`): run_id generation scheme and path containment are never stated explicitly.
- **BD-5** [blocker] (artifact-leakage, `output-contract`): bugfix-loop-runs/<run_id>.json falls one directory level outside the existing .gitignore glob for lifecycle-state/*.json (verified via git check-ignore), silently becoming git-trackable contrary to the ephemeral-snapshot convention it is modeled on.

## Termination Reviewer (termination-reviewer)

**Verdict:** FAIL

- **TR-1** [suggestion] (clarity, `invocation-modes`): Outer loop's cap/cap-trip/unattended-safety properties are all present but scattered across three sections rather than consolidated.
- **TR-2** [blocker] (missing-iteration-cap, `failure-modes`): Claim-failure "skip to next eligible bug" retry has no bound and no exclusion guarantee; could spin indefinitely inside a single turn, bypassing --max-turns entirely.
- **TR-3** [warning] (ambiguous-cap-trip, `failure-modes`): Whether PARKED/UNREPRODUCIBLE bugs remain eligible for cross-turn re-selection is unstated, making "board drained" / COMPLETE ambiguously reachable.

---

## Summary

**Total findings:** 17 (6 blockers, 8 warnings, 3 suggestions)
**Action required:** Address the 6 blocker(s) listed above and in the accompanying `.blockers.md` sidecar, then run `/adev:specify --revise --spec .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` to produce revision 2, and re-review.
