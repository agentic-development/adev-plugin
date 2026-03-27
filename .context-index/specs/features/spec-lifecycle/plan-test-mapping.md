# Live Spec: Plan-Test Mapping

---
charter: spec-lifecycle
status: review-pending
risk_level: medium
milestone: v1
created: 2026-03-27
---

## Behavioral Contract

### Preconditions

- A plan file exists at `.context-index/specs/features/<module>/<spec>.plan.md`
- The plan contains an ordered task list with file references
- The project has a test runner configured (detectable from `package.json` or `platform-context.yaml`)

### Behaviors

1. **When** `/adev-plan` creates a plan **then** each task in the task list includes a `tests:` field referencing the test file(s) that verify the task's acceptance criteria.

2. **When** `/adev-implement` completes a task and runs tests **then** the test pass/fail result is the authoritative signal for whether the task is done — no separate task status field is maintained.

3. **When** `/adev-status --spec <path>` queries a spec's implementation progress **then** it reads the plan's task list, extracts the `tests:` references, checks whether the referenced test files exist, and reports task completion as "<N>/<total> tasks with existing test files". `/adev-status` does NOT execute tests (it is read-only) — it checks file existence and last known test results from the most recent `npm test` run.

4. **When** a plan task has no `tests:` field **then** `/adev-status` reports it as "unverifiable" and does not count it toward completion.

5. **When** a test file referenced by a plan task does not exist **then** `/adev-status` reports the task as "test missing" and does not count it toward completion.

6. **When** all test files referenced by all plan tasks pass **then** the spec is considered fully implemented from a task-completion perspective.

### Postconditions

- Every plan task has a `tests:` field (may be empty for non-code tasks like documentation)
- Test pass/fail is the single source of truth for task completion
- No separate task status tracking (checkboxes, status fields) exists in plan files

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Plan task has no `tests:` field | `/adev-status` reports task as "unverifiable" | UNVERIFIABLE_TASK |
| Referenced test file not found | `/adev-status` reports task as "test missing" | TEST_NOT_FOUND |
| Test runner not configured | `/adev-status` warns: "Cannot verify tasks — no test runner detected" | NO_TEST_RUNNER |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Test execution uses the project's existing test runner (e.g., `node --test`), no additional test frameworks added.
- **Principle:** "Skills are primarily markdown" — Plan tasks and their test references are markdown content in `.plan.md` files.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Update `adev-plan/SKILL.md` | Require `tests:` field in each plan task | medium |
| Update `adev-implement/SKILL.md` | Document that test pass/fail is the completion signal | small |
| Update `adev-status/SKILL.md` | Add task completion query based on test file references | medium |
| Write tests | Test plan parsing, test file resolution, completion counting | medium |

## Acceptance Criteria

- [ ] Plan tasks created by `/adev-plan` include `tests:` fields referencing test files
- [ ] `/adev-status` reports task completion based on test pass/fail
- [ ] Tasks without `tests:` field are reported as "unverifiable"
- [ ] Missing test files are reported as "test missing"
- [ ] No task status checkboxes or status fields exist in plan files
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
