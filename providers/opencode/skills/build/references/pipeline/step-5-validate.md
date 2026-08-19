### Step 5: Validate

**Skip condition:** None. Validation always runs as the final step.

**Rigor tier propagation:** If `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the dispatched args so `/adev:validate` receives the explicit override at its own Execution Strategy tier resolution. If `--tier` was not passed to `/adev:build`, dispatch without it — `/adev:validate` resolves its own rigor tier from the routing signal, risk policy, or default `full`.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 5: Validate <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:validate" args="--spec <path> --plan <plan-path>">
})
```

The validate skill runs its full 13-check suite within the subagent's isolated context (narrowed to the fail-fast + synthesized compliance check when the resolved rigor tier is `quick`).

**After subagent returns:**
- **PASS:** All checks passed. Record in build state.
- **PASS_WITH_WARNINGS:** Error-severity checks passed but warning-severity checks failed. Build state records the warnings but does NOT treat the result as a build failure.
- **FAIL:** An error-severity check failed. If `build.max_retries` from user-config is > 0 and retry budget remains, enter the Validate→Implement Retry Loop (see below). Otherwise, record FAIL in build state. Validation FAIL does NOT retroactively block the build — the implementation is already done. Validation is informational.
- Record step as `completed` (with PASS/PASS_WITH_WARNINGS/FAIL noted) in build state.
