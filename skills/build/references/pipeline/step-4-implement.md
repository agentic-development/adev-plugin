### Step 4: Implement

When `--no-infra` is passed to build, set `ADEV_NO_INFRA=1` in the environment for implement and validate invocations. Each sub-skill runs its own preflight independently — build does not add a separate preflight step.

**Skip condition:** None. Implementation always runs unless the build was resumed past this step.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 4: Implement <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:implement" args="<plan-path>">
})
```

This is the longest-running step. The implement skill manages the per-task test discipline (per `implementation_mode`), specialist routing, subagent dispatch, per-task review at each task's resolved depth, visual verification, integration gates, source manifest stamping, commit trailers, and feature completeness DoD — all within the subagent's isolated context.

**Implement owns its lifecycle step events.** The `/adev:implement` subagent emits the implement `lifecycle_step` `started`, `step_completed` and `step_failed` events itself. The orchestrator never runs `adev report --type step --step implement`, with any status, before or after the dispatch. It records the outcome only in build state (`adev build-state record`).

**After subagent returns:**
- If `STEP_RESULT` `status` is `BLOCKED`: a task's review loop reached its cap unconverged, and implement halted on that task (the task is `plan_task` `blocked` with a `LOOP_*` code, execution state is `blocked`, and no later task started). That `plan_task` `blocked` event is the halt's recorded terminal, so no implement `step_failed` exists or is emitted for it. Record build state with `--status failed --verdict BLOCKED` and the loop code, task id and outstanding finding ids from the `STEP_RESULT` in `--error`, so `/adev:build --resume` re-enters at implement. Report the halt to the user and stop the build for this spec, without waiting for input. Do not re-dispatch implement and do not count this against `build.max_retries`.
- If verdict indicates quality gate or integration gate failure: run `recordStepResult()` with `status: "failed"` and the failure details (including tier-specific context: tier name, failing command, severity). Report the failures to the user and stop the build for this spec.
- Otherwise: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="implement"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

**Rigor tier propagation:** Read `<ADEV_ROOT>/skills/build/step4-tier-propagation.md` for the `--tier` and `--lite` handoff to `/adev:implement`.
