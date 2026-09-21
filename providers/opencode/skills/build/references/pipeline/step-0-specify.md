### Step 0: Specify (Full Pipeline only)

**Skip conditions:**
- `--full` NOT set → skip unconditionally (Implement Pipeline does not run specify).
- `.review.md` exists adjacent to the spec with PASS or PASS_WITH_NOTES verdict and is not stale → skip (spec already reviewed). Record as `skipped` in build state.
- `currentState(projectRoot, specPath).steps.specify.status === "completed"` AND that step's `verdict` is `"PASS"` or `"PASS_WITH_NOTES"` → skip (lifecycle log shows specify already passed in a prior session — the spec on disk is authoritative). Record as `skipped` in build state. (Per issue-527: prior versions of this skill dispatched `/adev:specify --revise` here, but `--revise` is not a flag on `/adev:specify`; reading the lifecycle log is the spec-compliant skip evidence.)
- Spec file exists on disk → skip. Record as `skipped`. Review will catch any drift between spec and code.

**Dispatch (when not skipped):**
- Spec file does NOT exist AND no completed specify event in lifecycle log → dispatch `/adev:specify --spec <path>` in creation mode.

```
Agent({
  description: "Build Step 0: Specify <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:specify" args="--spec <path>">
})
```

**After subagent returns:** Run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="specify"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

---
