# Architecture Review: plan-task-events

> **Date:** 2026-05-12
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** PASS_WITH_NOTES

last-reviewed-revision: 1
file-sha: 6d99bd3fd377b75e5e11e33eddb8e45d7db88bde

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES

- SA-1 · warning · `/adev:plan` Behavioral Changes §1 + `/adev:implement` §3 · The canonical `plan_task.status` enum (`pending | in_progress | done | blocked | skipped`) is introduced here but never enumerated in `lifecycle-event-log.spec.md`, which only shows `in_progress` as an example. · **Recommendation:** Add a one-line "Status enum: pending|in_progress|done|blocked|skipped" near the Behavioral Contract; consider upstream amendment to `lifecycle-event-log.spec.md` so the enum lives at the foundation.
- SA-2 · warning · Plan Markdown Surface §3 + Migration / Backfill · Ownership of the plan-file advisory header is split — this spec's task map carries the header-stamping task, but the migration-tool extension that runs it is owned by `issue-board-granularity-cleanup.spec.md`. · **Recommendation:** Explicitly state which spec produces the header. Either move the task entirely or keep "what the header says" here and let the sibling spec own "when it runs."
- SA-3 · suggestion · AC bullet 5 + Task Map "Architectural test: plan files are immutable" · The proposed test stores a plan-file SHA "at the time of the last `plan_task` 'pending' event," but `plan_task` events do not currently carry a `plan_sha` field — the check is not implementable from the current event shape. · **Recommendation:** Either add an optional `plan_sha` field to `plan_task` (open schema permits it; document in `lifecycle-event-log.spec.md`) or weaken the test to "git-log diff of plan file after first `plan_task pending` event timestamp."
- SA-4 · suggestion · `/adev:implement` §3 · No precondition guard prevents `reportPlanTask` from going `done → in_progress` or `pending → done` without `in_progress`. The library is append-only and stamps no validation. · **Recommendation:** Clarify whether the projection enforces a valid state machine and where, or explicitly note the channel is permissive and the projection reflects the last event.

## Security Reviewer (security-reviewer)

**Verdict:** PASS

- SEC-1 · suggestion · input-validation · `/adev:implement` §3 (blocked/skipped notes) · Blocker `notes` from agent output may contain stack traces, paths, or copied env values. Foundation spec caps notes at 4 KB but no operator-facing guidance is propagated. · **Recommendation:** Add a prose guard to `/adev:implement` §3: "Blocker notes must not contain secrets, env values, or full command output — keep to ≤200-char operator-facing summary."
- SEC-2 · suggestion · data-exposure · Migration-tool advisory header · The header refers to `<slug>.jsonl` which embeds the spec slug. Not a leak per se, but the header must be content-only. · **Recommendation:** Pin the exact header string in the spec and forbid any absolute-path or operator-name interpolation.

No findings in authentication, authorization, secrets, or rate-limiting — these surfaces are not present in this spec.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** PASS_WITH_NOTES

- CON-1 · warning · domain-model · This spec enumerates the status enum `pending | in_progress | done | blocked | skipped`. Conflicts with `lifecycle-event-log.spec.md` Behaviors (no enumeration) and `issue-board-granularity-cleanup.spec.md` §Migration Step §4 (derives `done | in_progress | pending | blocked` — `skipped` absent). · **Recommendation:** Enumerate the canonical enum once in the foundation spec; reference from this spec and the granularity-cleanup spec; ensure migration covers `skipped` or documents why it cannot arise from legacy issues.
- CON-2 · warning · contract · This spec lists `/adev:status` and `/adev:reconcile` among readers of `currentState(spec).planTasks`. `lifecycle-skill-instruction-updates.spec.md` does not mention plan-task reads for those skills. · **Recommendation:** Add a sentence to the sibling spec confirming those skills read `planTasks`, or weaken the reader list here.
- CON-3 · warning · pattern · AC #7 grep for `create(` calls passing `planTask:` is redundant — `json-issue-board-adapter.spec.md` already enforces `BOARD_GRANULARITY_VIOLATION` at the adapter layer. Risk of false positives on legitimate test fixtures. · **Recommendation:** Drop the grep test in favor of adapter enforcement, or scope to `skills/plan/**` and `skills/implement/**` only and exclude `tests/**`.
- CON-4 · suggestion · terminology · "The projection is the source of truth" contradicts Invariant #3 "State is derived, never stored." · **Recommendation:** Rephrase to "the projection is the authoritative *view* of task state (derived from `plan_task` events, which are the source of truth)."
- CON-5 · suggestion · naming · The `planTasks` entry shape `{ status, notes, updated }` is declared here downstream of where it should be defined. · **Recommendation:** Promote the entry shape into `lifecycle-event-log.spec.md` Behaviors and reference from this spec.

---

## Summary

**Total findings:** 0 blockers, 5 warnings, 5 suggestions.

**Action required:** Ready for planning. Warnings should be addressed in spec revision 2 or rolled into the implementation plan, but do not block `/adev:plan`. The recurring theme is foundation-level upgrades to `lifecycle-event-log.spec.md` (status enum, `plan_sha` field, `planTasks` entry shape); consider a small amendment to the foundation spec before planning to keep the contract single-sourced.
