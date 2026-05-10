# Implementation Plan: Lifecycle Skill Integration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/lifecycle-integration.spec.md
> **Review:** PASS_WITH_NOTES (2026-03-31)
> **Platform:** none, javascript (ESM), node:test

**Goal:** Update adev:plan, adev:implement, and adev:validate SKILL.md files to use the issue board for task tracking instead of TodoWrite.

**Architecture:** Pure skill markdown changes — no executable code. Skills reference `lib/issues/` functions and the `tasks.backend` manifest config. Changes are additive and backward compatible (no issue creation when `tasks.backend` is absent).

---

## File Structure

**Modify:**
- `skills/plan/SKILL.md` — Add issue creation to Step 7 (Execution Handoff)
- `skills/implement/SKILL.md` — Replace 3 TodoWrite references with issue board operations
- `skills/validate/SKILL.md` — Add validation outcome recording

**Reference (read, do not modify):**
- `.context-index/specs/features/task-management/issue-epic-crud.spec.md` — Interface contract
- `.context-index/specs/features/task-management/backend-adapters.spec.md` — Backend behaviors

## Context Packets

### Task 1 Context
- Spec: `lifecycle-integration.md` (Behaviors 1-4, Plan Integration)
- Skill: `skills/plan/SKILL.md` (Step 7: Execution Handoff, lines ~387-418)

### Task 2 Context
- Spec: `lifecycle-integration.md` (Behaviors 5-9, Implement Integration)
- Skill: `skills/implement/SKILL.md` (lines 53, 71, 329)

### Task 3 Context
- Spec: `lifecycle-integration.md` (Behaviors 10-11, Validate Integration)
- Skill: `skills/validate/SKILL.md` (lines ~325-340)

## Parallelization

- All three tasks are independent (different files). Can run in parallel.

---

### Task 1: Update adev:plan Step 7 [specialist: none]

**Charter capability:** Plan Integration
**Files:**
- Modify: `skills/plan/SKILL.md`

**Tests:** No test file — this is a markdown skill change. Acceptance verified by reading the file.

- [ ] **Write failing test**

Verify the current SKILL.md does NOT contain issue creation instructions:
```bash
! grep -q "issue board\|createEpic\|tasks.backend" skills/plan/SKILL.md
```

- [ ] **Verify test fails** (grep returns no match — expected)

- [ ] **Implement**

Add the following after the "Update charter Capability Map" paragraph in Step 7 (after line ~389), before the "next steps" output:

```markdown
**Issue creation (optional):** Read `tasks.backend` from `manifest.yaml`.

If `tasks.backend` is configured:
1. Create an epic: call `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })` from `lib/issues/registry.mjs` (use `getIssueManager(manifest)` to get the active adapter).
2. For each task in the plan, create an issue: call `create({ title: "<task title>", type: "task", priority: 2, epicId: "<epic-id>", planRef: "<plan-file-path>", planTask: <task-number> })`.
3. For each task with `Depends on: Task N, Task M` annotations, call `addDependency(<this-issue-id>, <dependency-issue-id>)` for each dependency.
4. Report: "Created epic `<epic-id>` with `<N>` issues on the issue board."

If `tasks.backend` is not configured in the manifest, skip issue creation entirely.
```

- [ ] **Verify test passes** — grep for "tasks.backend" succeeds
- [ ] **Commit**

```bash
git add skills/plan/SKILL.md
git commit -m "feat(task-management): add issue creation to adev:plan Step 7"
```

### Task 2: Replace TodoWrite in adev:implement [specialist: none]

**Charter capability:** Implement Integration
**Files:**
- Modify: `skills/implement/SKILL.md`

**Tests:** No test file — markdown change. Acceptance verified by grepping for zero TodoWrite references.

- [ ] **Write failing test**

```bash
grep -c "TodoWrite" skills/implement/SKILL.md
# Expected: 3 (current state)
```

- [ ] **Verify test fails** (3 references exist)

- [ ] **Implement**

Replace three TodoWrite references:

**Line 53** — Replace `Create a TodoWrite entry for every task extracted from the plan.` with:
```markdown
**Load or create issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
- If issues exist matching this plan's `plan-ref`, load them.
- If no issues exist, create them now (same procedure as adev:plan Step 7: create epic, then one issue per task with dependencies).
- Update the first task's issue status to `in_progress` via `update(id, { status: "in_progress" })`.

If `tasks.backend` is not configured, skip issue board operations.
```

**Line 71** — Replace `mark task as MANUAL in TodoWrite, skip to next task` with:
```markdown
mark the issue status as `deferred` with note "MANUAL — requires human implementation" via `update(id, { status: "deferred", notes: "MANUAL — requires human implementation" })`, skip to next task
```

**Line 329** — Replace `1. Mark the task complete in TodoWrite.` with:
```markdown
1. Update the issue status to `closed` via `close(id, "Implemented and reviewed")`.
```

- [ ] **Verify test passes** — `grep -c "TodoWrite" skills/implement/SKILL.md` returns 0
- [ ] **Commit**

```bash
git add skills/implement/SKILL.md
git commit -m "feat(task-management): replace TodoWrite with issue board in adev:implement"
```

### Task 3: Add Validation Outcome Recording [specialist: none]

**Charter capability:** Validate Integration
**Files:**
- Modify: `skills/validate/SKILL.md`

**Tests:** No test file — markdown change. Acceptance verified by reading the file.

- [ ] **Write failing test**

```bash
! grep -q "issue board\|validation outcome" skills/validate/SKILL.md
```

- [ ] **Verify test fails** (no match — expected)

- [ ] **Implement**

Add the following after "Update charter Capability Map" (line ~336), before the merge policy check:

```markdown
**Record validation outcome on issue board:** Read `tasks.backend` from `manifest.yaml`. If configured:
- Find all issues with `plan-ref` matching the validated spec's plan file.
- For each issue, add a note with the validation result:
  - PASS: `update(id, { notes: "Validated: PASS (YYYY-MM-DD) — <validation-report-path>" })`
  - FAIL: `update(id, { notes: "Validated: FAIL (YYYY-MM-DD) — <validation-report-path>" })`
- Do not change issue status based on validation outcome.

If `tasks.backend` is not configured, skip.
```

- [ ] **Verify test passes** — grep for "validation outcome" succeeds
- [ ] **Commit**

```bash
git add skills/validate/SKILL.md
git commit -m "feat(task-management): add validation outcome recording to adev:validate"
```

---

## Quality Gates

- Tests pass: `npm test`
- Zero `TodoWrite` references in `skills/implement/SKILL.md`
- All acceptance criteria from spec satisfied
