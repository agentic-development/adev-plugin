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

When review returns BLOCK and `--full` is set, the build dispatches the auto-retry loop reinstated by the `review-block-auto-retry` cross-cutting spec.

**Loop precondition:** `build.max_review_retries > 0` (default 2 per `lib/manifest.mjs` Task 12 of review-block-auto-retry; explicit `0` disables the loop and the build falls through to the sidecar+fail-loud path below). The loop also runs when `--auto` is passed regardless of the manifest value (subject to the same default).

**Loop steps for each revision N:**

1. **Read the latest review verdict** from `currentState(spec).steps.review.byRevision[N]` (the per-revision projection from Task 3 of review-block-auto-retry).
2. **Read `<spec-stem>.review.md` + `<spec-stem>.blockers.md`** — the canonical sidecars written by `/adev:review-specs` Step 6b-bis. The `.blockers.md` writer keys entries by canonical `blocker_id` (Task 5).
3. **Detect legacy reviewer output:** if any BLOCK finding in `.review.md` is missing the `blocker_id` field (pre-Task-6 reviewer), the loop falls through to the sidecar+fail-loud path below. Log `LEGACY_REVIEWER_OUTPUT`. Do NOT auto-retry — the loop requires canonical IDs to detect convergence.
4. **Dispatch `/adev:specify --revise <spec>`** via the CLI verb:

   ```bash
   adev specify revise --spec <spec-path> --auto
   ```

   The verb (Task 9 — `lib/cli/specify.mjs`) produces revision N+1 as a targeted patch, emits a `spec_revised` lifecycle event, clears `.blockers.md`, and exits 0 on success. On `SPEC_NOT_BLOCKED` (exit 2) the build is misaligned with the spec status — abort the loop and fall through to sidecar+fail-loud. On any other non-zero exit, abort the loop.

5. **Re-run `/adev:review-specs --spec <spec>`** against the new revision N+1. The reviewers emit canonical `blocker_id`s (Task 6); `/adev:review-specs` writes a fresh `.review.md` + (if BLOCK) a fresh `.blockers.md`. Lifecycle events for this iteration carry `revision: N+1` (Behavior 4 of review-block-auto-retry).

6. **Apply the convergence detector** (`lib/loop-convergence.mjs` from Task 11):

   ```text
   partition = partitionBlockers(prev_blockers, curr_blockers)
   verdict   = evaluateStopCondition({
     addressed: partition.addressed,
     persistent: partition.persistent,
     new_: partition.new_,
     prev_blockers,
     retries_remaining,
     verdict: <latest review verdict>,
     human_final_pass: <--require-human-final-pass flag>,
   })
   ```

7. **Act on the verdict:**

   | Verdict | Action |
   |---------|--------|
   | `PASS` | Loop succeeds. Record the review step as `completed` with `verdict: PASS`. Proceed to the next pipeline step (Plan). |
   | `PASS_PENDING_HUMAN` | The `--require-human-final-pass` flag is on AND review converged on PASS at rev N+1. Emit a `human_approval_required` lifecycle event via `reportHumanApprovalRequired`. Halt the build with exit code non-zero and the message: "Review converged on PASS at revision N+1. Run `/adev:build --resume --spec <spec>` to acknowledge and continue." |
   | `NO_PROGRESS` | `addressed == ∅ AND new_ == ∅ AND persistent == prev_blockers` — the LLM produced the identical blocker set. Stop with `LOOP_NO_PROGRESS`. Write the sidecar+fail-loud artifacts. Halt the build with exit non-zero. |
   | `REGRESSED` | `\|new_\| > \|addressed\|` — the revise introduced more blockers than it resolved. Stop with `LOOP_REGRESSED`. Preserve rev N+1 (no rollback). Write sidecar+fail-loud. Halt the build with exit non-zero. The operator decides whether to revert. |
   | `BUDGET_EXHAUSTED` | `retries_remaining === 0 AND verdict !== PASS`. Stop with `LOOP_BUDGET_EXHAUSTED`. Write sidecar+fail-loud. Halt the build with exit non-zero. |
   | `CONTINUE` | Progress was made (or first revision); retries remain. Decrement `retries_remaining` and loop back to step 4. |

**The `--require-human-final-pass` flag** is a hybrid-mode gate: when passed, even a PASS verdict from the loop halts the build at `PASS_PENDING_HUMAN` so a human operator approves the final spec revision before plan/implement runs. Operators in risk-averse domains use this gate to retain final say on auto-revised specs.

**Sidecar+fail-loud fallback** (legacy reviewer output OR loop terminal verdicts NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED):

1. Ensure `<spec-stem>.review.md` exists (already written by `/adev:review-specs`).
2. Ensure `<spec-stem>.blockers.md` reflects the current blocker set (written by the canonical writer in `lib/blockers-writer.mjs`).
3. Record the review step as `failed` in build state with the relevant terminal verdict (`LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` / `LEGACY_REVIEWER_OUTPUT`).
4. Halt the build with a clear next-action message naming the spec, the terminal verdict, and the operator's recovery options (manual edit + `/adev:review-specs` re-run, or `/adev:build --resume` after manual fix).

When `--full` is NOT set: review BLOCK stops the build immediately (no auto-retry, no sidecar write — the Implement Pipeline assumes a pre-existing PASS review).
