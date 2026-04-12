# Live Spec: Lifecycle Skill Integration

---
charter: task-management
status: validated
milestone: 1
revision: 1
charter-revision: 2
created: 2026-03-31
updated: 2026-04-01
source-manifest:
  sha: "5dc2f0a"
  files:
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - skills/validate/SKILL.md
  computed-at: "2026-04-12T11:48:02.769Z"
---

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
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
