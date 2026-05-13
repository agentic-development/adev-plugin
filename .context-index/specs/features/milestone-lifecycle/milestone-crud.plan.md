<!-- DO NOT EDIT statuses inline — see lifecycle log milestone-crud.jsonl -->
# Implementation Plan: Milestone Create and List (Release Schema Update)

> **Methodology:** adev
> **Charter:** .context-index/specs/features/milestone-lifecycle/charter.md
> **Spec:** .context-index/specs/features/milestone-lifecycle/milestone-crud.spec.md (rev 3)
> **Review:** PASS_WITH_NOTES (2026-05-11)

**Note:** The release schema changes for this spec (behaviors 4a, 4b, Release Field Schema) are planned as part of the combined plan at `milestone-ship.plan.md`. Specifically:

- **Task 1** (Release schema in I/O) — implements `loadMilestones`/`saveMilestones` support for `release: { strategy: ... }`
- **Task 3** (`--strategy` flag in `milestoneCreate`) — implements behaviors 4a, 4b, and UNKNOWN_STRATEGY error
- **Task 7** (SKILL.md documentation) — documents the `--strategy` flag

See: `.context-index/specs/features/milestone-lifecycle/milestone-ship.plan.md`
