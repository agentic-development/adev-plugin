# Architecture Review: lifecycle-event-log

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** BLOCK

last-reviewed-revision: 1
file-sha: b90940958b5fbf6e0453d7108329a65e82f04ea7

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES — no blockers, 4 warnings, 3 suggestions

- **SA-1** · suggestion · Behavioral Contract: prose enumeration of exports slightly out of sync with formal Interface Contracts list. Either drop inline enumeration or fully mirror it.
- **SA-2** · warning · Behaviors/Error Cases: severity-resolution semantics inconsistent. Preconditions say "missing config → fallback to warning"; Error Cases say `loadDomainConfig` throws → `DOMAIN_CONFIG_ERROR` (no append). Decide best-effort vs strict and align.
- **SA-3** · warning · Interface Contracts: `requireGate(state, stepName)` reads `lifecycle.gate_mode` from manifest internally, mixing caller-state with side-channel I/O. Add `mode` to the signature or document the implicit manifest read.
- **SA-4** · warning · Module Boundaries: manifest-template edit task crosses module boundaries without explicit charter reference. Link the task to the charter's "Manifest additions" block.
- **SA-5** · warning · Behaviors: aggregation rule conflates `warning`-severity FAIL with `advisory`-severity FAIL. Add explicit per-severity mapping table covering all four severities.
- **SA-6** · suggestion · Postconditions: "file ends with complete \\n-terminated line" is true globally but not per-caller under concurrent writes. Reword as caller-scoped postcondition.
- **SA-7** · suggestion · Cross-spec: `reportPlanTask` as canonical substitute for board-level plan-task issues is implicit. Add a behavior or AC making the cross-spec contract explicit.

## Security Reviewer (security-reviewer)

**Verdict:** BLOCK — 1 blocker, 3 warnings, 1 suggestion

- **SEC-1** · **blocker** · input-validation: `slugFromSpec` derives JSONL path from caller-supplied `specPath` without sanitization. A path like `../../.bashrc.spec.md` passes the extension check and writes lines to arbitrary filesystem locations. Add path-traversal defense: assert the resolved absolute path begins with `<projectRoot>/.context-index/lifecycle-state/`.
- **SEC-2** · warning · data-exposure: free-form `notes` field on `reportReviewer`/`reportValidator` has no size or content constraint. Secrets in tool error strings could land permanently in append-only logs. Add max byte length (e.g., 4 KB) and document caller responsibility; consider best-effort redaction of common secret patterns.
- **SEC-3** · warning · input-validation: `EVENT_TOO_LARGE` at 1 MB allows a misbehaving agent to grow a single log to unbounded size. `listLifecycleStates` would then degrade across the aggregate. Add a per-log size cap (e.g., 50 MB) and a `LOG_TOO_LARGE` error pointing to compaction.
- **SEC-4** · warning · data-exposure: `listLifecycleStates(projectRoot)` accepts caller-supplied `projectRoot` without validation. A symlinked or unexpected path could fold arbitrary `.jsonl` files. Validate `projectRoot` against the project's `manifest.yaml` location.
- **SEC-5** · suggestion · input-validation: `manual_override.reason` is free text; render-time markdown escaping should be specified explicitly in `renderMarkdown`'s contract.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 1 blocker, 2 warnings, 1 suggestion

- **CON-1** · **blocker** · contract: naming-convention drift between sibling specs and charters. The event variant is `plan_task` (snake_case), the issue board field is `planTask` (camelCase), the `task-management` charter uses `plan_ref`/`plan_task` (snake_case). The mix is genuine codebase legacy, but the specs need an explicit "Naming Conventions" note distinguishing event-discriminator names (snake_case) from issue-board field names (preserve existing FileAdapter convention) so reviewers and implementers know the rule.
- **CON-2** · warning · naming: StateProjection internal inconsistency — `currentStep`/`currentTask` (camelCase) alongside `plan_tasks` (snake_case). Standardize within the projection.
- **CON-3** · warning · domain-model: the granularity-invariant ownership boundary is implicit. The charter's Ownership Note should explicitly state that `json-issue-board-adapter` owns enforcement.
- **CON-4** · suggestion · naming: `task_id` inside `plan_task` events vs `plan_task` field on WorkItem — clarify these are different entities (plan-internal task id vs board WorkItem field).

---

## Summary

**Total findings:** 16 (2 blockers, 9 warnings, 5 suggestions)

**Blockers (must resolve before planning):**
- SEC-1: Path-traversal defense in `slugFromSpec`
- CON-1: Explicit naming-convention note (event names snake_case; issue fields preserve existing convention)

**Action required:** Revise the spec to address SEC-1 and CON-1 at minimum. Strongly consider addressing the warnings (SA-2, SA-3, SA-5, SEC-2, SEC-3, SEC-4) which surface real design ambiguities that would otherwise propagate into the migration and execution-state specs. Re-run `/adev:review-specs` after revision.
