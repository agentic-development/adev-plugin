# Blocker Handling: BLOCK→revise Auto-Retry Loop

Full instructions for `skills/build/SKILL.md` Step 1's Blocker handling. Loaded whenever review returns BLOCK with `--full` set.

**Loop precondition:** `build.max_review_retries > 0` (default 2; explicit `0` disables the loop and the build falls through to the sidecar+fail-loud path below). The loop also runs when `--auto` is passed regardless of the manifest value (subject to the same default).

**Two independent counters.** `retries_remaining` (outer, from `build.max_review_retries`) counts full review→revise cycles. A separate **mechanism-check inner counter**, fixed at 3 attempts, counts `check-mechanisms` retry loops within a single authoring pass (step 5 below) and is tracked ONLY in this loop's own working state — never read from or written to `retries_remaining`, and reset to 0 at the start of every new revision N. Exhausting the inner counter stops the build (`BUDGET_EXHAUSTED`, same sidecar+fail-loud path) without touching `retries_remaining`.

## Loop steps for each revision N

1. **Read the latest review verdict** from `currentState(spec).steps.review.byRevision[N]` (the per-revision projection).
2. **Read `<spec-stem>.review.md` + `<spec-stem>.blockers.md`** — the canonical sidecars written by `/adev:review-specs` Step 6b-bis, keyed by canonical `blocker_id`.
3. **Detect legacy reviewer output:** if any BLOCK finding in `.review.md` is missing the `blocker_id` field (pre-Task-6 reviewer), fall through to the sidecar+fail-loud path below. Log `LEGACY_REVIEWER_OUTPUT`. Do NOT auto-retry — the loop requires canonical IDs to detect convergence.
4. **Branch on `finding_class`** — get the breakdown before dispatching any authoring:

   ```bash
   adev specify group-blockers --spec <spec-path>
   ```

   Prints `{ anchors, anchors_not_found, decision_blocker_ids, external_blockers }` (`lib/cli/specify.mjs`).

   - **`decision_blocker_ids` non-empty → `DECISION_REQUIRED`.** Halt immediately, before any authoring is dispatched. Write the sidecar+fail-loud artifacts (below) with terminal verdict `DECISION_REQUIRED`. These blockers need a human call, not an authored patch — never loop on them.
   - **`external_blockers` non-empty → `EXTERNAL_REMEDY`.** For each, render an "External remedies" progress line: pass `blocker_id`, `section_anchor`, `remedy_ref` through `lib/governance/remedy-ref-render.mjs::renderRemedyRef` (same helper `/adev:review-specs`'s "External Remedies" report section uses — Task 11 keeps the two channels byte-identical) and print:

     ```text
     External remedy needed for <blocker_id> (<section_anchor>): <rendered remedy_ref>
     ```

     Exclude every id in `external_blockers` from THIS cycle's convergence accounting — before calling `partitionBlockers`/`evaluateStopCondition` in step 7, filter these ids out of both `prev_blockers` and `curr_blockers`. The loop continues on any remaining `defect` blockers (from `anchors` in the same response); if `anchors` is also empty, nothing is authored this cycle and the spec's only path forward is human action on the external remedies — treat that case the same as `DECISION_REQUIRED` (halt, sidecar+fail-loud, verdict `EXTERNAL_REMEDY`).
   - **Otherwise** (only `defect`-classed blockers, or `anchors` non-empty alongside excluded `external_blockers`): proceed to step 5.

5. **Dispatch per-anchor authoring, then revise, then verify (with the inner cap):**

   a. Follow `skills/specify/SKILL.md` Revise Mode step 2 (`skills/specify/revise-mode-authoring-dispatch.md`) to dispatch one authoring subagent per anchor in `anchors` and collect `authoredSections`.

   b. Run the revise verb:

      ```bash
      adev specify revise --spec <spec-path> --auto --authored-sections <json-or-@path>
      ```

      Produces revision N+1, emits `spec_revised`, clears `.blockers.md`, exits 0 on success. `SPEC_NOT_BLOCKED` (exit 2): the build is misaligned with spec status — abort the loop, fall through to sidecar+fail-loud. Any other non-zero exit: abort the loop.

   c. **Verify the revision's citations** (BEH-6/BEH-7):

      ```bash
      adev specify check-mechanisms --spec <spec-path>
      ```

      Exit 0: all cited referents resolved (or none cited) — proceed to step 6. Exit 2: unresolved referents — read `unresolved` from the JSON output; for each entry, construct a new `mechanism-existence` blocker (`finding_class: defect`, `section_anchor` set to the anchor the unresolved citation came from, prose naming the unresolved candidate + reason) via `adev blockers write`, then increment the inner counter and loop back to step 5a for a fresh authoring pass **on this same revision** — do NOT advance to revision N+1 again, and do NOT touch `retries_remaining`. If the inner counter reaches 3, stop with `BUDGET_EXHAUSTED` via the sidecar+fail-loud path (inner-cap exhaustion, `retries_remaining` untouched).

6. **Re-run `/adev:review-specs --spec <spec>`** against the new revision N+1. Because the lifecycle log already carries a `step_completed` review event for this spec at an earlier revision, `/adev:review-specs` Step 4 (Task 10 / BEH-8) automatically diff-scopes reviewer dispatch and context to the changed sections — no separate mode flag needed from this loop; the first review of any spec always used full-context dispatch, and every re-review after it is diff-scoped by that same lifecycle-log check. The reviewers emit canonical `blocker_id`s; `/adev:review-specs` writes a fresh `.review.md` + (if BLOCK) a fresh `.blockers.md`. Lifecycle events for this iteration carry `revision: N+1`.

7. **Apply the convergence detector** (`lib/loop-convergence.mjs`), with `external_blockers` ids from step 4 excluded from both blocker sets per that step's instruction:

   ```text
   partition = partitionBlockers(prev_blockers, curr_blockers)   // external ids excluded from both
   verdict   = evaluateStopCondition({
     addressed: partition.addressed,
     persistent: partition.persistent,
     new_: partition.new_,
     prev_blockers,
     retries_remaining,
     verdict: <latest review verdict>,
     human_final_pass: <--require-human-final-pass flag>,
     blocker_count_history: <per-cycle blocker counts so far, this spec>,
     not_converging_window: <manifest build.not_converging_window, default 2>,
   })
   ```

8. **Act on the verdict:**

   | Verdict | Action |
   |---------|--------|
   | `PASS` | Loop succeeds. Record the review step as `completed` with `verdict: PASS`. Proceed to the next pipeline step (Plan). |
   | `PASS_PENDING_HUMAN` | `--require-human-final-pass` is on AND review converged on PASS at rev N+1. Emit `human_approval_required` via `reportHumanApprovalRequired`. Halt with exit non-zero: "Review converged on PASS at revision N+1. Run `/adev:build --resume --spec <spec>` to acknowledge and continue." |
   | `NOT_CONVERGING` | Blocker count has been non-decreasing for `not_converging_window` consecutive cycles — the authoring passes aren't making headway even though the exact blocker set keeps changing (so `NO_PROGRESS`'s stricter identical-set check never fires). Stop with `LOOP_NOT_CONVERGING`. Sidecar+fail-loud. Halt with exit non-zero. |
   | `NO_PROGRESS` | `addressed == ∅ AND new_ == ∅ AND persistent == prev_blockers` — the LLM produced the identical blocker set. Stop with `LOOP_NO_PROGRESS`. Sidecar+fail-loud. Halt with exit non-zero. |
   | `REGRESSED` | `\|new_\| > \|addressed\|` — the revise introduced more blockers than it resolved. Stop with `LOOP_REGRESSED`. Preserve rev N+1 (no rollback). Sidecar+fail-loud. Halt with exit non-zero. The operator decides whether to revert. |
   | `BUDGET_EXHAUSTED` | `retries_remaining === 0 AND verdict !== PASS`. Stop with `LOOP_BUDGET_EXHAUSTED`. Sidecar+fail-loud. Halt with exit non-zero. |
   | `CONTINUE` | Progress was made (or first revision); retries remain. Decrement `retries_remaining`, reset the inner mechanism-check counter to 0, and loop back to step 4 for revision N+1. |

**The `--require-human-final-pass` flag** is a hybrid-mode gate: when passed, even a PASS verdict from the loop halts the build at `PASS_PENDING_HUMAN` so a human operator approves the final spec revision before plan/implement runs.

## Sidecar+fail-loud fallback

Legacy reviewer output, `DECISION_REQUIRED`, `EXTERNAL_REMEDY` (with no remaining defect blockers to author), inner-cap exhaustion, or loop terminal verdicts `NOT_CONVERGING` / `NO_PROGRESS` / `REGRESSED` / `BUDGET_EXHAUSTED`:

1. Ensure `<spec-stem>.review.md` exists (already written by `/adev:review-specs`).
2. Ensure `<spec-stem>.blockers.md` reflects the current blocker set (written by the canonical writer in `lib/blockers-writer.mjs`).
3. Record the review step as `failed` in build state with the relevant terminal verdict (`DECISION_REQUIRED` / `EXTERNAL_REMEDY` / `LOOP_NOT_CONVERGING` / `LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` / `LEGACY_REVIEWER_OUTPUT`).
4. Halt the build with a clear next-action message naming the spec, the terminal verdict, and the operator's recovery options (manual edit + `/adev:review-specs` re-run, or `/adev:build --resume` after manual fix; for `DECISION_REQUIRED`, the message names which blockers need a human decision).
