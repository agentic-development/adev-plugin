# Blocker Handling: BLOCK→revise Auto-Retry Loop

Full instructions for `/adev:build` Step 1's Blocker handling. Loaded whenever review returns BLOCK with `--full` set.

**Loop precondition:** `build.max_review_retries > 0` (default 2; explicit `0` disables the loop and the build falls through to the sidecar+fail-loud path below). The loop also runs when `--auto` is passed regardless of the manifest value (subject to the same default).

**Two independent counters.** `retries_remaining` (outer, from `build.max_review_retries`) counts full review→revise cycles. A separate **mechanism-check inner counter**, fixed at 3 attempts, counts `check-mechanisms` retry loops within a single authoring pass (step 5 below) and is tracked ONLY in this loop's own working state — never read from or written to `retries_remaining`, and reset to 0 at the start of every new revision N. Exhausting the inner counter stops the build (`BUDGET_EXHAUSTED`, same sidecar+fail-loud path) without touching `retries_remaining`.

## Loop steps for each revision N

1. **Read the latest review verdict** from `currentState(spec).steps.review.byRevision[N]` (the per-revision projection).
2. **Read `<spec-stem>.review.md` + `<spec-stem>.blockers.md`** — the canonical sidecars written by `/adev:review-specs` Step 6b-bis, keyed by canonical `blocker_id`.
3. **Detect unusable reviewer output:** `/adev:review-specs` Step 6b-bis already excludes individually malformed findings from `.blockers.md` — the orchestrator drops a finding with no `finding_type` before the write (`LEGACY_REVIEWER_OUTPUT`), and `adev blockers write` drops one whose `blocker_id` cannot be derived (`INVALID_BLOCKER_ID` advisory) — a reviewer partially malforming *some* findings does NOT by itself disqualify the cycle; the malformed ones are already gone from `.blockers.md`, and whatever well-formed entries remain are exactly what step 4 below acts on, unmodified. Check `.blockers.md`'s actual content, not `.review.md`: if it contains at least one entry, proceed to step 4. Only fall through to the sidecar+fail-loud path (logging `LEGACY_REVIEWER_OUTPUT`) when `.blockers.md` is empty despite `.review.md` recording verdict BLOCK — every finding this round was unusable and there is nothing left to auto-retry on.
4. **Branch on `finding_class`** — get the breakdown before dispatching any authoring:

   ```bash
   adev specify group-blockers --spec <spec-path>
   ```

   Prints `{ anchors, anchors_not_found, decision_blocker_ids, external_blockers }` (`lib/cli/specify.mjs`).

   - **`decision_blocker_ids` non-empty → `DECISION_REQUIRED`.** Halt immediately, before any authoring is dispatched. Write the sidecar+fail-loud artifacts (below) with terminal verdict `DECISION_REQUIRED`. These blockers need a human call, not an authored patch — never loop on them.
   - **`external_blockers` non-empty → `EXTERNAL_REMEDY`.** For each entry, print an "External remedies" progress line using the entry's fields exactly as `group-blockers` returned them — its `remedy_ref` is already rendered through the same `renderRemedyRef` that `adev blockers write` applies for `/adev:review-specs`'s "External Remedies" report section, so the two channels print byte-identical values. Do not re-render or reformat it:

     ```text
     External remedy needed for <blocker_id> (<section_anchor>): <remedy_ref>
     ```

     Exclude every id in `external_blockers` from THIS cycle's convergence accounting — before calling `partitionBlockers`/`evaluateStopCondition` in step 7, filter these ids out of both `prev_blockers` and `curr_blockers`. The loop continues on any remaining `defect` blockers (from `anchors` in the same response); if `anchors` is also empty, nothing is authored this cycle and the spec's only path forward is human action on the external remedies — treat that case the same as `DECISION_REQUIRED` (halt, sidecar+fail-loud, verdict `EXTERNAL_REMEDY`).
   - **Otherwise** (only `defect`-classed blockers, or `anchors` non-empty alongside excluded `external_blockers`): proceed to step 5.

5. **Dispatch per-anchor authoring, then revise, then verify (with the inner cap):**

   a. Follow `/adev:specify` Revise Mode step 2 (`<ADEV_ROOT>/skills/specify/references/revise-mode-authoring-dispatch.md`) to dispatch one authoring subagent per anchor in `anchors` and collect `authoredSections`. On an inner retry (arriving here from step 5c), `anchors` is the fresh `adev specify group-blockers` output for the `mechanism-existence` blockers 5c just wrote.

   b. Run the revise verb. On the **first** pass for this revision:

      ```bash
      adev specify revise --spec <spec-path> --auto --authored-sections <json-or-@path>
      ```

      Produces revision N+1, sets status `review-pending`, emits `spec_revised`, clears `.blockers.md`, exits 0 on success. `SPEC_NOT_BLOCKED` (exit 2): the build is misaligned with spec status — abort the loop, fall through to sidecar+fail-loud. Any other non-zero exit: abort the loop.

      On an **inner retry** (arriving from step 5c), the spec is already at N+1 and `review-pending`. Add `--same-revision`, which splices into that revision without bumping it again and emits no `spec_revised`:

      ```bash
      adev specify revise --spec <spec-path> --same-revision --authored-sections <json-or-@path>
      ```

      `SPEC_NOT_PENDING` (exit 2) here means the spec is no longer the revision this pass started from — abort the loop, fall through to sidecar+fail-loud. Any other non-zero exit (including `NO_REVIEW_SIDECARS`, which means step 5c's `adev blockers write` did not leave a sidecar): abort the loop the same way.

   c. **Verify the revision's citations** (BEH-6/BEH-7):

      ```bash
      adev specify check-mechanisms --spec <spec-path>
      ```

      Exit 0: all cited referents resolved (or none cited) — proceed to step 6. Exit 2: unresolved referents. Read `unresolved` from the JSON output; each entry carries `candidate`, `code`, `reason`, and the `section_anchor` of the heading the citation sits under. For each entry, construct a new `mechanism-existence` blocker (`reviewer: build-loop`, `finding_type: mechanism-existence`, `finding_class: defect`, that entry's `section_anchor`, prose naming the unresolved candidate and reason) and write them with `adev blockers write --spec <spec-path> --findings @<path> --revision <N+1>`. `reviewer` is required: the verb derives each `blocker_id` from `reviewer` + `finding_type` + `section_anchor` + prose, and exits 2 with `NO_USABLE_FINDINGS` if every entry is dropped — treat that like inner-cap exhaustion. An entry whose `section_anchor` is `(none)` sits before the first heading and has no section to re-author — treat it like inner-cap exhaustion below. Then increment the inner counter and go back to step 5a for a fresh authoring pass **on this same revision**: do not advance to revision N+1 again, and do not touch `retries_remaining`. If the inner counter reaches 3, stop with `BUDGET_EXHAUSTED` via the sidecar+fail-loud path (inner-cap exhaustion, `retries_remaining` untouched).

6. **Re-run `/adev:review-specs --spec <spec>`** against the new revision N+1. Because the lifecycle log already carries a `step_completed` review event for this spec at an earlier revision, `/adev:review-specs` Step 4 (BEH-8) automatically diff-scopes reviewer dispatch and context to the changed sections — no separate mode flag needed from this loop; the first review of any spec always used full-context dispatch, and every re-review after it is diff-scoped by that same lifecycle-log check. The reviewers emit canonical `blocker_id`s; `/adev:review-specs` writes a fresh `.review.md` + (if BLOCK) a fresh `.blockers.md`. Lifecycle events for this iteration carry `revision: N+1`.

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
     blocker_count_history: <this cycle's count appended to prior cycles' counts, this spec>,
     not_converging_window: <manifest build.not_converging_window, default 2>,
   })
   ```

   **`blocker_count_history`'s per-cycle count is `curr_blockers.length` — the SAME already-`external_blockers`-excluded set used for `partitionBlockers` above, never the raw `.blockers.md` entry count.** BEH-9 defines `NOT_CONVERGING` over the "loop-eligible" blocker count specifically so a real, correctly-unfixable `external` blocker that legitimately persists cycle over cycle (step 4's design: rewriting the spec can never resolve it) doesn't itself inflate the trend and falsely trip `NOT_CONVERGING` while genuine `defect`-blocker progress is happening underneath. Append this cycle's count to the running array in order — do not recompute or reorder prior entries.

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
