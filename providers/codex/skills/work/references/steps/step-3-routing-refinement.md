## Step 3: State-Aware Routing Refinement

### Next-Step Projection

Map each in-progress spec's lifecycle position to its next action. Derive position from `currentState(projectRoot, specPath).steps` and `readExecutionState` (Step 1) — do not guess from file presence.

| Current lifecycle position | Next step |
|---|---|
| Execution state `active` with a `currentTask` | `/adev:implement` (resume the current task) |
| Execution state `blocked` | `/adev:recover` (or `/adev:debug` if it is a code fault) |
| `specify` completed, no `review` step | `/adev:review-specs` |
| `review` passed (PASS / PASS_WITH_NOTES), no `plan` | `/adev:plan` |
| `plan` completed, no `route` and no `implement` | `/adev:route` (or `/adev:implement` if routing is skipped) |
| `implement` completed for all tasks, no `validate` | `/adev:validate` |
| `validate` passed | Done — offer `/adev:deploy`, `/adev:retro`, or new work |
| `review` verdict BLOCK | `/adev:specify --revise` (address the blockers) |

**When invoked with no description, or when the user says "continue" / "next" / "resume", route directly to the projected next step for the most recently active spec — do not re-ask what to work on.** This is the no-argument conductor path: `/adev:work` alone means "advance my current work."

Then apply the refinements below before proposing a route:

Before proposing a route, check whether the state scan (Step 1) should override or refine the classification:

1. **Resume override:** If the user says "work on X" and the state scan found an incomplete plan for module X, route to `/adev:implement` (not `/adev:brainstorm`):

   > Module **X** has an active plan with incomplete tasks. Routing to `/adev:implement` to continue the plan.

2. **Gate warning:** If the user says "plan X" but the lifecycle projection shows specs for module X have not passed review (`state.steps.review` missing or `verdict: BLOCK`), warn:

   > Specs for **X** haven't been reviewed yet. Want to run `/adev:review-specs` first, or proceed to planning anyway?

   Wait for the user's response.
