[adev docs](README.md) > Workflow Guides

# Build Phase

The build phase turns reviewed specifications into working code. You decompose specs into ordered tasks, optionally score them for human vs agent execution, implement each task with test-driven development, and optionally orchestrate the entire pipeline end-to-end.

> **Prerequisite:** All specs must have passed architecture review before planning. If you have not run `/adev:review-specs`, go back to the [Design Phase](design-phase.md) first.

## Plan

**Skill:** `/adev:plan`

**What it does:** Decomposes a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task follows TDD (write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability. The plan includes context packets, parallelization hints, and specialist routing annotations.

**When to use it:** After specs pass review, as the first step in the build phase. Planning bridges the gap between "what to build" (the spec) and "how to build it" (the task list).

**Prerequisites:** A Live Spec at `review-passed` status with an adjacent `.review.md` file showing a PASS or PASS_WITH_NOTES verdict.

**Example invocation:**

```
/adev:plan --spec .context-index/specs/features/auth/login.spec.md
```

You can also plan an entire feature (`--feature <module>`), a release (`--release <name>`), or a milestone (`--milestone <name>`).

**Output:** A plan file at `.context-index/specs/features/<module>/<spec>.plan.md` with task breakdown, file lists, context packets, and dependency ordering.

See the [Skill Reference](skills.md) for full details on modes and task structure.

## Route

**Skill:** `/adev:route`

**What it does:** Scores each task in an implementation plan on four dimensions — spec completeness, pattern coverage, blast radius, and novelty — and recommends a routing mode: auto-agent (fully autonomous), assisted-agent (checkpoint at mid-point), or human-only (agent scaffolds, human implements).

**When to use it:** After planning and before implementation. Routing helps you decide which tasks agents can handle autonomously and which need human oversight. This step is optional but recommended for plans with mixed complexity.

**Prerequisites:** A plan file must exist (produced by `/adev:plan`).

**Example invocation:**

```
/adev:route --plan .context-index/specs/features/auth/login.plan.md
```

**Output:** Routing annotations added to the plan file with scores and recommendations per task.

See the [Skill Reference](skills.md) for full details on the scoring matrix and routing modes.

## Write Test

**Skill:** `/adev:write-test`

**What it does:** TDD test authoring specialist. Authors failing tests (RED phase), produces immutable handoff blocks, and detects specification gaming. Can work from a Live Spec, a source file's interface, or a free-form behavioral description.

**When to use it:** Before implementation (to write failing tests first), or standalone when you need test coverage for existing code. The RED phase of TDD ensures tests define expected behavior before any code is written.

**Prerequisites:** A spec defining expected behavior, or a source file to test against.

**Example invocation:**

```
/adev:write-test --red --spec .context-index/specs/features/auth/login.spec.md
```

**Output:** Failing test files with immutable handoff blocks that `/adev:implement` uses to verify the GREEN phase.

See the [Skill Reference](skills.md) for full details on invocation modes and tamper detection.

## Implement

**Skill:** `/adev:implement`

**What it does:** Executes an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, enforcing TDD (RED-GREEN-REFACTOR), and running 2-stage review (spec compliance then code quality) after each task. Supports resuming interrupted implementations and single-task re-runs.

**When to use it:** After planning (and optionally routing). This is the core execution engine — it turns plan tasks into working, tested, reviewed code.

**Prerequisites:** A plan file produced by `/adev:plan`, a passing `.review.md` file for the referenced spec, and a working git branch (not main or master).

**Example invocation:**

```
/adev:implement --plan .context-index/specs/features/auth/login.plan.md
```

You can re-run a single task with `--task <N>` or preview routing decisions with `--dry-run`.

**Output:** Implemented code with passing tests, commit trailers linking back to specs and tasks, and updated plan checkboxes showing completion status.

See the [Skill Reference](skills.md) for full details on the TDD mandate, review stages, and specialist routing.

### TDD Workflow

The implement skill enforces a strict TDD cycle for every task:

1. **RED** — Write a failing test that defines the expected behavior
2. **GREEN** — Write the minimum code to make the test pass
3. **REFACTOR** — Clean up without changing behavior, keeping tests green

This cycle is non-negotiable. The agent will not skip writing tests first, and it will not loosen test assertions to make them pass. If a test fails, the code is fixed — not the test.

## Build

**Skill:** `/adev:build`

**What it does:** End-to-end build orchestrator that chains review, plan, route, implement, and validate into a single pipeline. Supports resuming from failure, batch processing by milestone phase, and dry-run preview.

**When to use it:** When you want to execute a full lifecycle pipeline without manual handoffs between steps. Useful for features where you want hands-off execution from spec to validated implementation.

**Prerequisites:** A reviewed spec (for the default implement pipeline) or an unreviewed spec (with `--full` for the full pipeline starting from review).

**Example invocation:**

```
/adev:build --spec .context-index/specs/features/auth/login.spec.md
```

Use `--full` to start from review, or `--phase <name>` to build all specs in a milestone.

**Output:** A fully implemented and validated feature with all lifecycle artifacts updated.

See the [Skill Reference](skills.md) for full details on pipeline steps and resume behavior.

## Moving to Validation

Before moving to the validation phase, verify:

- All plan tasks are implemented (checkboxes marked in the plan file)
- All tests pass (`npm test` or your project's test command)
- All quality gates are green
- Code has been committed with proper spec and plan-task trailers

Once everything is green, proceed to [Validate & Debug](validate-debug.md).
