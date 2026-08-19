## Repo-Mode-Inside-Workspace Advisory

**Repo-Mode-Inside-Workspace Advisory:** When the skill is invoked inside a registered repo (`detectWorkspace(cwd)` non-null AND `currentRepoSlug` is set), behaviour is repo-scoped (existing single-repo flow). Additionally, print this one-line advisory to **stdout** (same channel as existing skill messages — NOT stderr, logs, or hook channels), **exactly once per invocation**:

```
(Advisory: running repo-scoped inside workspace '<name>'. For
workspace-level orchestration, cd to <workspace-root> and re-run.)
```

The advisory does not block; it does not appear when `detectWorkspace` returns null.

### Step 1.5: Infrastructure Preflight

Runs only when the spec or plan declares infra_requirements.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/steps/step-1.5-infra-preflight.md` for the full instructions. Do not act on this section from the summary above.

### Step 1.6: Progress Tracking (Claude Code)

Harness-specific progress reporting during a long implement run.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/steps/step-1.6-progress-tracking.md` for the full instructions. Do not act on this section from the summary above.

### Step 2: Per-Task Execution Loop

The core loop: for each routed task, dispatch write-test then implement, then run the two review stages.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/steps/step-2-per-task-loop.md` for the full instructions. Do not act on this section from the summary above.

### Step 2.5: Parallel Group Execution

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/parallel-mode.md` for the full Parallel Group Execution instructions.
> Load it only when `--parallel` is passed; it is not needed on a serial run.

### Step 2-post: Integration Gate

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/integration-gate.md` for the full Integration Gate instructions.
> Load it only when the plan declares integration-tier gates; it is not needed on a serial run.

### Step 3: Final Review

The whole-plan review that runs once every task has completed.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/steps/step-3-final-review.md` for the full instructions. Do not act on this section from the summary above.

### Step 4: Completion

Closing actions once the final review passes.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/implement/references/steps/step-4-completion.md` for the full instructions. Do not act on this section from the summary above.
