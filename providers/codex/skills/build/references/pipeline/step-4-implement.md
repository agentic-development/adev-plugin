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

This is the longest-running step. The implement skill manages TDD loops, specialist routing, subagent dispatch, 2-stage review, visual verification, integration gates, source manifest stamping, commit trailers, and feature completeness DoD — all within the subagent's isolated context.

**After subagent returns:**
- If verdict indicates quality gate or integration gate failure: run `recordStepResult()` with `status: "failed"` and the failure details (including tier-specific context: tier name, failing command, severity). Report the failures to the user and stop the build for this spec.
- Otherwise: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="implement"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.
