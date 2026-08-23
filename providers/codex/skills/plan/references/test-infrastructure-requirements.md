## Test Infrastructure Requirements

> These requirements must be satisfied before integration/infrastructure tests can run.
> Tasks without these prerequisites will produce setup errors, not test failures.
> **Never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| AWS S3 | Task 1.2, Task 1.4 | integration |
| Postgres 15 | Task 2.1, Task 2.3 | schema, integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `AWS_ACCESS_KEY_ID` | AWS S3 | AWS IAM console — dedicated test account |
| `DATABASE_URL` | Postgres | Provision test DB — inject as CI secret (contains password) |

### Pre-Provisioned State

- [ ] AWS test account with IAM permissions scoped to specific actions and test resource ARNs
- [ ] Postgres 15 instance accessible from test runner

### CI Configuration

These tests are excluded from the default `npm test` run. To execute:
```bash
npm run test:integration
# or: node --test --test-name-pattern "integration"
```

> **Local runs:** Create `.env.test` with credential values. `.env.test` MUST be listed in `.gitignore`.
> In CI, inject credentials as secrets — never hardcode them in workflow files.

### Unresolved Requirements

| Task | Issue | Action Required |
|------|-------|-----------------|
| Task 3.1 | `PLAN_INFRA_UNKNOWN` — external system not identifiable | Declare `infra_requirements:` in spec frontmatter |
~~~

**Non-blocking:** Plan does NOT block when infra requirements are unresolved. It completes the task list and surfaces unresolved items in the `### Unresolved Requirements` table for human review before running `/adev:implement`.

**Strategy Summary update (amends plan-integration Behavior 4):** When this section is emitted, extend the Strategy Distribution summary to include an "infrastructure" column:

~~~
Strategy Distribution:
  unit        ·  8 tasks   (source: fallback)      — no external infra needed
  integration ·  4 tasks   (source: detected/high)  — requires: AWS S3, SQS, Postgres
  schema      ·  2 tasks   (source: detected/high)  — requires: Postgres
  visual      ·  1 task    (source: spec-declared)  — requires: Storybook server (from infra_requirements:)
~~~

### Task Structure

> **Note on task status.** The per-task `- [ ]` checkboxes shown below are authoring guides only — they help human reviewers scan a plan but are not mutated by skills. `/adev:plan`, `/adev:implement`, `/adev:status`, and any other skill read authoritative task state from the spec's lifecycle event log (`plan_task` events) via `currentState(projectRoot, specPath).planTasks`, never from these checkboxes. Plan-task tables MUST NOT include a `Status` column — status belongs in the lifecycle log, not in the plan markdown. See `agent-reliable-state-artifacts/plan-task-events.spec.md` for the contract.

Each task follows TDD. Steps are granular (2-5 minutes each).

````markdown
### Task N: <Component Name> [specialist: <name|none>]

**Charter capability:** <which capability from the charter this implements>
**Strategy:** <strategy_id> (source: <source>, confidence: <level>)
**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `tests/exact/path/to/test.ts`

**Tests:** `tests/exact/path/to/test.ts` — every task must reference at least one test file. If no test file exists yet, the task must create one. This field is required; a task without a `tests:` field is incomplete.

**Context to load:**
- `.context-index/adrs/001-session-store-redis.md` (relevant decision)
- `.context-index/samples/service-sample.md` (follow this pattern)

- [ ] **Write failing test**

```typescript
describe('specificBehavior', () => {
  it('should do the expected thing', () => {
    const result = functionUnderTest(input);
    expect(result).toEqual(expected);
  });
});
```

- [ ] **Verify test fails**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: FAIL — `functionUnderTest is not defined` (or similar)

- [ ] **Implement**

```typescript
export function functionUnderTest(input: InputType): OutputType {
  // implementation
  return expected;
}
```

- [ ] **Verify test passes**

Run: `<test command from constitution quality gates> -- <path to test file>`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/<module>/<short-description>`

```bash
git add <specific files>
git commit -m "feat(<module>): add specific feature"
```
````

### Task Ordering

Order tasks so each produces working, testable software:

1. Data models and types first (foundation)
2. Core logic and services second (business rules)
3. API layer or interface contracts third (boundaries)
4. UI components or integration points last (consumer layer)
5. Integration tests after all units are wired

Explicit dependencies: if Task 3 depends on Task 1 and Task 2, state it:
```markdown
### Task 3: Wire Dashboard Route [specialist: none]
**Depends on:** Task 1, Task 2
```

### Quality Gates Section

End the plan with the full quality gate check from the constitution:

```markdown
---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `<test command>`
- Lint passes: `<lint command>`
- Type check passes: `<typecheck command>`
- All acceptance criteria from spec satisfied

If `governance/gates.yaml` exists, use its gate definitions instead of constitution Quality Gates. List deterministic gates with commands. Note probabilistic/no-command gates as skipped.
```
