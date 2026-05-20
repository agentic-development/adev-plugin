---
date: 2026-05-19
spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md
verdict: PASS
last-reviewed-revision: 1
file-sha: 4d9b3943aa887bc4ea7bb40400336132fd914e418a4c5e4d5b7b7e6970b60c52
---

# Architecture Review: plan-routing-sidecar

> **Date:** 2026-05-19
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt/Skill |
|----|------|------|---------|--------------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS

No findings. The spec is structurally sound:

- API shape is well-defined: `writeRoutingSidecar(planPath, entries)` and `readRoutingSidecar(planPath)` are named in the Actionable Task Map; per-entry fields (`task_id`, `selected_agent`, `scores` with four dimensions `0..1`, `rationale` ≤ 400 chars) enumerated in Behavior 2.
- Error codes are complete and orthogonal: `SIDECAR_WRITE_FAILED`, `ROUTING_SIDECAR_MISSING`, `ROUTING_ENTRY_MISSING`, `ROUTING_AGENT_INVALID`, `PLAN_MUTATED_WITHOUT_SIDECAR`, `UNKNOWN_SIDECAR_PEER`.
- Module boundary is respected: changes confined to `lib/plan-routing-sidecar.mjs` (new), `lib/plan-immutability.mjs` (existing), and the `/adev:route` + `/adev:implement` SKILL.md files. The `plan-task-events.spec.md` CON-8 amendment is intra-charter (both live under `agent-reliable-state-artifacts`).
- ADR-0012 compliance is explicit: the spec names itself as one of the three acceptance gates (route fix, CON-8 amendment, detector enhancement) and includes the ADR Proposed → Accepted flip as a task.
- Constitution principle 1 ("minimize external dependencies") satisfied — reuses existing `fs.writeFile` + temp-then-rename pattern from `lib/build-state.mjs`. No new dependency.
- Constitution principle 2 ("skills primarily markdown") respected — runtime logic moved to `adev route emit-sidecar` / `adev implement read-routing` CLI verbs per the cli-driver-surface convention; SKILL.md remains the source of truth.
- Behaviors 6 and 7 (detector with/without sidecar) are internally consistent: inline block + no sidecar ⇒ violation; inline block + sidecar present ⇒ tolerated with M-commit history check still applying.
- Acceptance criteria align with charter rev-8 Capability Map: each rev-7-added capability has a corresponding criterion.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

No findings. This spec defines internal lifecycle tooling with no exposure surface:

- No authentication or authorization surface — sidecar files are written by trusted CLI verbs against local plan files.
- No network, no PII, no secrets, no rate-limited operations.
- Atomic temp-then-rename pattern prevents readers from observing partial state.
- Error paths (`SIDECAR_WRITE_FAILED`, `ROUTING_SIDECAR_MISSING`) fail loud with explicit codes rather than silent fallback, which is the safer choice and matches the spec's design intent.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS

No findings. The spec is consistent with its sibling specs, parent charter, and the framework conventions:

- **Naming:** `task_id` snake_case matches the canonical event-schema field name from `lifecycle-event-log.spec.md` and the `task_id` anchor convention from `plan-task-events.spec.md § Plan Markdown Surface (CON-3)` (anchors like `t1`, `t2`). Sidecar peer naming `<plan-stem>.routing.md` follows ADR-0012's `<artifact-stem>.<purpose>.md` exactly.
- **Sidecar peers enumeration:** The four peers `.review.md`, `.validate.md`, `.routing.md`, `.blockers.md` match ADR-0012's permitted-peers table and the charter Capability Map rev-7 entry.
- **Error codes:** SCREAMING_SNAKE_CASE, matching the existing project convention (e.g. `ROUTING_*`, `SIDECAR_*`, `PLAN_*`).
- **Capability Map alignment:** The four rev-7 capabilities this spec implements (`Plan-adjacent sidecar pattern`, `/adev:route plan-mutation fix`, `CON-8 enumerated peers`, `Plan-immutability detector enhancement`) all carry `must-have / specified (plan-routing-sidecar.spec.md)` in the charter rev-8 Capability Map.
- **Cross-cutting compliance:** No conflicts with cross-cutting specs (`spec-file-suffixes.spec.md` continues to own `.spec.md`/`.plan.md` artifact-kind suffixes; this spec's `.routing.md` is a sidecar peer, orthogonal per the write-state-suffix taxonomy in CON-10 of the parent charter).
- **ADR-0012 flow:** Spec correctly lists "Acceptance: ADR-0012 status flips from Proposed to Accepted once this spec is implemented and validated" — matches the ADR's own acceptance criteria.
- **Out-of-scope statement:** Cursor-provider 5-plan migration explicitly deferred and tracked separately, consistent with the charter's rev-7 Capability Map row marked `—` (not yet specified).

---

## Summary

**Total findings:** 0 (0 blockers, 0 warnings, 0 suggestions)
**Action required:** The spec is ready for planning. Run `/adev:plan --spec .context-index/specs/features/agent-reliable-state-artifacts/plan-routing-sidecar.spec.md` to proceed.
