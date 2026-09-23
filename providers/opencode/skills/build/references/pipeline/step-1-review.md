### Step 1: Review

**Skip condition (checked by orchestrator before dispatch):** A `.review.md` file exists adjacent to the spec, contains a PASS or PASS_WITH_NOTES verdict, and is not stale (its modification date is equal to or newer than the spec's modification date). If skipped, record step as `skipped` in build state.

**Implement Pipeline guard:** When `--full` is NOT set and the spec file exists but no adjacent `.review.md` is found (or the review is stale/BLOCK):
> Warning: No `.review.md` found for `<spec>`. Run `/adev:review-specs --spec <path>` first, or use `--full` to include review in the build.

Stop the build. Do not proceed to plan.

**Rigor tier propagation:** If `--tier <t>` was passed to `/adev:build`, append `--tier <t>` to the dispatched args so `/adev:review-specs` receives the explicit override at its own Step 2.5 tier resolution. If `--tier` was not passed to `/adev:build`, dispatch without it — `/adev:review-specs` resolves its own rigor tier from the routing signal, risk policy, or default `full`.

**Subagent dispatch:**

```
Agent({
  description: "Build Step 1: Review <spec-name>",
  run_in_background: false,
  prompt: <subagent prompt template with skill="adev:review-specs" args="--spec <path>">
})
```

**After subagent returns:**
- If verdict is BLOCK: see Blocker-Fix Loop below.
- If verdict is PASS or PASS_WITH_NOTES: run the `recordStepResult()` call from Dispatch Loop step 4 with `stepName="review"`. Then follow Dispatch Loop step 5 (re-invoke or stop). Do NOT stop here.

**Blocker handling (Full Pipeline — BLOCK→revise auto-retry loop):**

When review returns BLOCK and `--full` is set, the build dispatches `/adev:specify --revise <spec>` against the canonical `blocker_id`-keyed `<spec-stem>.blockers.md` sidecar, in the auto-retry loop reinstated by the `review-block-auto-retry` cross-cutting spec (amended by rev 2 with `finding_class`-branching, a `mechanism-existence` inner-cap check, and `NOT_CONVERGING`).

> **Conditional loading:** Read `<ADEV_ROOT>/skills/build/references/blocker-auto-retry-loop.md` for the full loop steps, the `DECISION_REQUIRED`/`EXTERNAL_REMEDY` finding_class branches, the `mechanism-existence` inner-cap check, the verdict-action table (including `NOT_CONVERGING`), the `LEGACY_REVIEWER_OUTPUT` detection, and the sidecar+fail-loud fallback. Load it whenever review returns BLOCK with `--full` set.

When `--full` is NOT set: review BLOCK stops the build immediately (no auto-retry, no sidecar write — the Implement Pipeline assumes a pre-existing PASS review).
