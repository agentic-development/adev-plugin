---
charter: task-management
status: validated
milestone:
revision: 2
charter-revision: 3
created: 2026-03-31
updated: 2026-08-13
source-manifest:
  sha: "5dc2f0a"
  files:
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - skills/validate/SKILL.md
    - skills/debug/SKILL.md
  computed-at: "2026-04-12T11:48:02.769Z"
drift_detected: true
---

# Live Spec: Lifecycle Skill Integration

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `manifest.yaml` containing `tasks.backend` (or defaulting to `file`)
- For plan integration: a reviewed spec and plan file exist
- For implement integration: a plan file with tasks exists
- For validate integration: an implemented spec with associated issues exists

### Behaviors

**Plan Integration (adev:plan Step 7):**

1. **When** adev:plan saves a plan file **then** it creates an epic with the plan's title and `plan-ref` pointing to the `.plan.md` file.
2. **When** the epic is created **then** adev:plan creates one issue per plan task, with title matching the task title, type `task`, priority `2` (medium), `plan-ref` pointing to the plan file, `plan-task` set to the task number, and `epic-id` set to the new epic.
3. **When** a plan task has `Depends on: Task N, Task M` annotations **then** the corresponding issue dependencies are recorded via `addDependency()`.
4. **When** `tasks.backend` is not configured in the manifest **then** adev:plan skips issue creation entirely (backward compatible).

**Implement Integration (adev:implement):**

5. **When** adev:implement loads a plan (Step 1) **then** it reads the issue board and locates issues matching the plan via `plan-ref`. If no issues exist, it creates them by calling the same shared procedure as adev:plan Step 7 (create epic from plan, then create one issue per task with dependencies).
6. **When** adev:implement starts executing a task **then** it updates the corresponding issue status to `in_progress`.
7. **When** a task is routed as `human-only` **then** the corresponding issue status is set to `deferred` with note "MANUAL — requires human implementation".
8. **When** both reviews pass for a task (Step 2h) **then** the corresponding issue status is updated to `closed` with reason "Implemented and reviewed".
9. **When** adev:implement tracks task progress **then** it uses the issue board for all status updates. The skill must not invoke `TodoWrite`.

**Claim Preflight (adev:implement Step 1, adev:debug Phase 1.6) — revision 2:**

> Added 2026-08-13 for `issue-608`. The claim mechanism itself (`adev issues claim` / `release`, the `owner` / `claimed_at` fields, and the CAS-atomic `requireClaimable` precondition) is specified by `backend-migration.spec.md`; what follows is only the obligation on lifecycle skills to *call* it. Origin: two agents independently diagnosed and fixed the same p0 command-injection bug an hour apart, opening duplicate PRs #214 and #215. The board already carried the signal — the issue was `in_progress` — but no skill re-read it at the moment work began.

12. **When** adev:implement has loaded or created the plan's epic (Step 1) and `tasks.backend` is configured **then** it claims that epic via `adev issues claim <epic-id> --owner <operator> --branch <current-branch>` before dispatching any task.
13. **When** the claim exits `2` (`ISSUE_ALREADY_CLAIMED` or `ISSUE_CLOSED`) **then** the skill halts before dispatching any task, reports the holding `owner` and `claimed_at`, and does not take the claim over autonomously. Takeover requires an explicit user decision.
14. **When** the claim exits `1` (usage error, unknown issue, or `CLAIM_UNSUPPORTED_BACKEND`) **then** the skill warns and continues. A backend with no atomic write cannot offer the guarantee, and blocking on it would train operators to bypass the gate.
15. **When** adev:implement reaches Completion (Step 4) **then** it releases the epic claim, leaving `branch` and `pr` intact as the record of where the work went.
16. **When** adev:debug has reproduced a bug (Phase 1) and resolved an issue id — from `--issue`, or from a unique open issue whose `spec_ref` matches the Phase 1.5 spec — **then** it claims that issue before Phase 2 investigation, with the same exit-code contract as behaviors 13 and 14, and releases it in Phase 6.
17. **When** adev:debug resolves more than one candidate issue by `spec_ref` **then** it asks the user rather than guessing; **when** it resolves none **then** it skips the phase without creating a board entry (per the board-granularity invariant).

**Validate Integration (adev:validate):**

10. **When** adev:validate completes with PASS **then** it updates all issues associated with the validated spec (matched via `plan-ref` to the spec's plan) by adding a note "Validated: PASS (YYYY-MM-DD) — <validation-report-path>".
11. **When** adev:validate completes with FAIL **then** it updates associated issues by adding a note "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" without changing their status.

### Postconditions

- After adev:plan: all plan tasks have corresponding issues with correct dependencies
- After adev:implement: all executed task issues are `closed`; manual tasks are `deferred`
- After adev:validate: validation outcome is recorded on all relevant issues
- No `TodoWrite` references remain in the skill files

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Plan has tasks but `tasks.backend` is not configured | Skip issue creation silently | N/A |
| Issue board is missing when adev:implement starts | Auto-create from plan (same as adev:plan) | N/A |
| `br` not available during skill execution | Fall back to file backend via registry | N/A |
| Issue update fails mid-implementation | Log warning, continue implementation (non-blocking) | WARN |
| Claim target held by a different live owner | Halt before dispatch/investigation; report holder and `claimed_at`; never take over autonomously | ISSUE_ALREADY_CLAIMED (exit 2) |
| Claim target already closed | Halt; the work is done or was withdrawn | ISSUE_CLOSED (exit 2) |
| Backend has no atomic check-and-set | Warn and continue — the guarantee is unavailable, but blocking would train bypassing | CLAIM_UNSUPPORTED_BACKEND (exit 1) |
| adev:debug finds no issue matching the spec | Skip the claim phase; do not create a board entry | N/A |

## System Constitution Reference

- **"Skills are primarily markdown"** — Integration is achieved by updating SKILL.md instruction text. No executable logic added to skill files.
- **"Minimize external dependencies"** — Skills call `lib/issues/` functions which use Node.js built-ins only.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update adev:plan | Add Step 7 task creation instructions to `skills/plan/SKILL.md` | medium |
| Update adev:implement | Replace 3 TodoWrite references in `skills/implement/SKILL.md` | medium |
| Update adev:validate | Add validation outcome recording to `skills/validate/SKILL.md` | small |

## Acceptance Criteria

- [ ] `skills/plan/SKILL.md` Step 7 includes epic + issue creation instructions
- [ ] `skills/implement/SKILL.md` has zero references to `TodoWrite`
- [ ] `skills/implement/SKILL.md` Step 1 loads or creates issue board
- [ ] `skills/implement/SKILL.md` Step 2 updates issue status to `in_progress` on task start
- [ ] `skills/implement/SKILL.md` Step 2 (human-only) sets issue status to `deferred`
- [ ] `skills/implement/SKILL.md` Step 2h updates issue status to `closed` on task completion
- [ ] `skills/validate/SKILL.md` records validation outcome on associated issues
- [ ] Backward compatible: no issue creation when `tasks.backend` is absent from manifest
- [ ] `skills/implement/SKILL.md` Step 1 claims the epic via `adev issues claim` before any task dispatch, and Step 4 releases it
- [ ] `skills/debug/SKILL.md` Phase 1.6 claims the resolved issue before Phase 2, and documents the `--issue` argument
- [ ] Both skills document exit `2` as a halt and exit `1` as warn-and-continue, and neither instructs an autonomous takeover
- [ ] Neither skill sets `owner` or `claimed_at` directly — the CAS-atomic CLI verb is the only writer
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
