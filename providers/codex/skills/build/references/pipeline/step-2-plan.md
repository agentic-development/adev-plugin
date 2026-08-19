### Step 2: Plan

**Skip condition (checked by orchestrator before dispatch):** A `.plan.md` file exists adjacent to the spec. If skipped, record step as `skipped` in build state.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 2: Plan <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:plan" args="--spec <path>">
})
```

**After subagent returns:**
- If verdict is constitution-violation: run `recordStepResult()` with `status: "failed"` and the violation details. Stop the build for this spec.
- Otherwise: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="plan"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.
