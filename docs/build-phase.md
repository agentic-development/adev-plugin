[adev docs](README.md) > Workflow Guides

# Build Phase

The build phase turns reviewed specifications into working code. You decompose specs into ordered tasks, optionally score them for human vs agent execution, implement each task with test-driven development, and optionally orchestrate the entire pipeline end-to-end.

> **Prerequisite:** All specs must have passed architecture review before planning. If you have not run `/adev:review-specs`, go back to the [Design Phase](design-phase.md) first.

## Plan

**Skill:** `/adev:plan`

**What it does:** Decomposes a reviewed Live Spec into an ordered task list ready for `/adev:implement`. Every task carries the test steps of the project's [`implementation_mode`](configuration.md#implementation_mode) (under the default `tdd`: write failing test, verify fail, implement, verify pass, commit) and traces back to a charter capability. The plan includes context packets, parallelization hints, and specialist routing annotations.

**When to use it:** After specs pass review, as the first step in the build phase. Planning bridges the gap between "what to build" (the spec) and "how to build it" (the task list).

**Prerequisites:** A Live Spec at `review-passed` status with an adjacent `.review.md` file showing a PASS or PASS_WITH_NOTES verdict.

**Example invocation:**

```
/adev:plan --spec .context-index/specs/features/auth/login.spec.md
```

You can also plan an entire feature (`--feature <module>`), a release (`--release <name>`), or a milestone (`--milestone <name>`).

**Output:** A plan file at `.context-index/specs/features/<module>/<spec>.plan.md` with task breakdown, file lists, context packets, and dependency ordering.

See the [Skill Reference](skill-reference.md) for full details on modes and task structure.

## Route

**Skill:** `/adev:route`

**What it does:** Scores each task in an implementation plan on four dimensions — spec completeness, pattern coverage, blast radius, and novelty — and recommends a routing mode: auto-agent (fully autonomous), assisted-agent (checkpoint at mid-point), or human-only (agent scaffolds, human implements).

**When to use it:** After planning and before implementation. Routing helps you decide which tasks agents can handle autonomously and which need human oversight. This step is optional but recommended for plans with mixed complexity.

**Prerequisites:** A plan file must exist (produced by `/adev:plan`).

**Example invocation:**

```
/adev:route --plan .context-index/specs/features/auth/login.plan.md
```

**Output:** A sibling `<plan-stem>.routing.json` sidecar holding scores and a recommendation per task. The plan file is read-only after `/adev:plan` authored it and is never modified by routing. Render the sidecar as a markdown table with `adev route render-sidecar --plan <path>`.

See the [Skill Reference](skill-reference.md) for full details on the scoring matrix and routing modes.

## Write Test

**Skill:** `/adev:write-test`

**What it does:** TDD test authoring specialist. Authors failing tests (RED phase), produces immutable handoff blocks, and detects specification gaming. Can work from a Live Spec, a source file's interface, or a free-form behavioral description.

**When to use it:** Before implementation (to write failing tests first), or standalone when you need test coverage for existing code. It is a test-first tool. `/adev:implement` does not dispatch it by default, because the implementer writes its own tests.

**Prerequisites:** A spec defining expected behavior, or a source file to test against.

**Example invocation:**

```
/adev:write-test --red --spec .context-index/specs/features/auth/login.spec.md
```

**Output:** Failing test files with immutable handoff blocks that `/adev:implement` uses to verify the GREEN phase.

See the [Skill Reference](skill-reference.md) for full details on invocation modes and tamper detection.

## Implement

**Skill:** `/adev:implement`

**What it does:** Executes an implementation plan by dispatching a fresh subagent per task, routing to domain specialists when applicable, applying the test discipline of the project's [`implementation_mode`](configuration.md#implementation_mode) (TDD by default), and reviewing each task at its resolved depth: one synthesized reviewer under `quick` (the default), spec compliance then code quality under `full`, or, for an operator-authorized `lite` task, no per-task reviewer behind a post-task tripwire (see [Core Concepts → Graduated Rigor Tiers](concepts.md#graduated-rigor-tiers)). Supports resuming interrupted implementations and single-task re-runs.

**When to use it:** After planning (and optionally routing). This is the core execution engine — it turns plan tasks into working, tested, reviewed code.

**Prerequisites:** A plan file produced by `/adev:plan`, a passing `.review.md` file for the referenced spec, and a working git branch (not main or master).

**Example invocation:**

```
/adev:implement --plan .context-index/specs/features/auth/login.plan.md
```

You can re-run a single task with `--task <N>` or preview routing decisions with `--dry-run`.

**Output:** Implemented code with passing tests, commit trailers linking back to specs and tasks, and a `plan_task` completion event per task in the lifecycle log. The plan file itself is not modified.

See the [Skill Reference](skill-reference.md) for full details on the TDD mandate, review stages, and specialist routing.

### Test Discipline

What the implementer is told about tests depends on the project's [`implementation_mode`](configuration.md#implementation_mode):

- **`tdd`** (the default): RED-GREEN-REFACTOR for every task. Write a failing test, write the minimum code to pass it, then clean up while keeping the tests green. No production code is written without a failing test first.
- **`test-required`**: tests that cover the change are required, in any order. Stage 2 review reports missing coverage as an Important finding.
- **`agent-default`**: the implementer decides whether a change needs tests.

In every mode the agent does not loosen assertions to make a test pass. If a test fails, the code is fixed — not the test.

### Parallel Execution (`--parallel`)

By default, `/adev:implement` runs tasks strictly serially — parallel subagents would collide on the shared working tree. With `--parallel`, file-disjoint task groups instead run **concurrently in adev-managed git worktrees**, so independent work proceeds at the same time without conflicts.

```
/adev:implement --parallel .context-index/specs/features/auth/login.plan.md
```

**How it works:**

- **Groups come from the plan.** The task groups are *consumed, not computed* — `/adev:plan` writes a `## Parallelization` section listing which tasks are independent, and `--parallel` runs those groups concurrently in waves (bounded by a concurrency cap). If the plan has no usable parallelization section, or only one group, implementation falls back to serial automatically.
- **Each group gets its own worktree.** adev creates an isolated worktree under `.adev/worktrees/` (git-ignored) anchored to the main repo root, so worktrees never nest even when implement runs inside another worktree. Each group's subagent commits to its own branch.
- **Merge-back is verified and deterministic.** After all groups finish, adev asserts the orchestrator branch wasn't polluted, verifies every group actually committed its tasks (a group that drops tasks is marked failed and not merged), then merges the verified groups back in a deterministic order. On a merge conflict it aborts cleanly rather than merging partial work.
- **Behavioral equivalence is the contract.** A parallel run must produce the same result as a serial one — same tests passing, same public surface. This is enforced by a load-bearing equivalence eval, not just runtime checks.

**Recovering from a failed run.** On a partial failure, the failed group's worktree is *retained* for inspection and its plan tasks stay open, while successful groups still merge. Re-running then aborts that group with `RERUN_COLLISION` so stale work is never silently reused. Clear the retained worktree with `adev worktree remove --slug <…> --force`, or pass `--fresh` to auto-remove retained worktrees and re-run:

```
/adev:implement --parallel --fresh .context-index/specs/features/auth/login.plan.md
```

The `adev worktree` and `adev parallel` CLI verbs that back this mode are documented in the [CLI Reference](cli-reference.md).

## Build

**Skill:** `/adev:build`

**What it does:** End-to-end build orchestrator that chains review, plan, route, implement, and validate into a single pipeline. Supports resuming from failure, batch processing by milestone, and dry-run preview.

**When to use it:** When you want to execute a full lifecycle pipeline without manual handoffs between steps. Useful for features where you want hands-off execution from spec to validated implementation.

**Prerequisites:** A reviewed spec (for the default implement pipeline) or an unreviewed spec (with `--full` for the full pipeline starting from review).

**Example invocation:**

```
/adev:build --spec .context-index/specs/features/auth/login.spec.md
```

Use `--full` to start from review, or `--milestone <name>` to build all specs in a milestone.

**Output:** A fully implemented and validated feature with all lifecycle artifacts updated.

See the [Skill Reference](skill-reference.md) for full details on pipeline steps and resume behavior.

## Moving to Validation

Before moving to the validation phase, verify:

- All plan tasks are implemented (`/adev:status` shows each task done)
- All tests pass (`npm test` or your project's test command)
- All quality gates are green
- Code has been committed with proper spec and plan-task trailers

Once everything is green, proceed to [Validate & Debug](validate-debug.md).
