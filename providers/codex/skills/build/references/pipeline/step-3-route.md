### Step 3: Route

**Skip condition (checked by orchestrator before dispatch):** The `--no-route` flag is set. Mark step as `skipped` in build state.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 3: Route <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:route" args="--plan <plan-path>">
})
```

**After subagent returns:**
- Route annotations are advisory. This step does not produce a pass/fail verdict. If the subagent reports FAILED or the skill is unavailable, log a warning and continue.
- Run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="route"` (use `status: "completed"` or `status: "skipped"` on error). Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.
