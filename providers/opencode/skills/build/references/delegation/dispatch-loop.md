### Dispatch Loop (the only thing the orchestrator does)

On every invocation (whether fresh `--spec` or `--resume`), the orchestrator performs this dispatch loop exactly once:

1. **Read build state BEFORE taking any action.** Read or create state via `adev build-state`:

   ```bash
   # Returns { state, next }. If the read returns null, follow with `create`.
   adev build-state next --spec <SPEC_PATH>
   # If state is null and a fresh pipeline is needed:
   adev build-state create --spec <SPEC_PATH> [--milestone <PHASE>] [--full]
   adev build-state next --spec <SPEC_PATH>
   ```

   Where `<SPEC_PATH>` is the spec path, `<PHASE>` is the milestone name (omit when null), and `--full` is added when `--full` is set. The build state file is the single source of truth for pipeline position — not in-context memory, not the conversation history, not prior subagent results.

2. **Determine next step.** Use the `next` field from step 1's output. If `next` is `null`, all steps are done — print the final summary and exit. Otherwise, evaluate the step's skip conditions against disk artifacts. If skip conditions are met, record a skip and re-read:

   ```bash
   adev build-state record --spec <SPEC_PATH> --step <STEP_NAME> --status skipped
   adev build-state next   --spec <SPEC_PATH>
   ```

   Repeat skip evaluation until a non-skipped step is found or all steps are done. Dispatch at most ONE non-skipped step.

3. **Partial Artifact Detection (incremental-artifact-writes.spec.md, Behavior 5).** Before dispatching the subagent for the determined step, check whether a `.partial` file exists for that step's output artifact. Run:

   ```bash
   adev partial detect --root .context-index
   ```

   The verb returns JSON `{ partials: [...] }`. Filter to entries whose canonical path matches the step about to dispatch:

   - `specify` → `<spec-path>`
   - `plan` → `<spec-path>` minus `.spec.md` plus `.plan.md`
   - `validate` → `<spec-path>` minus `.spec.md` plus `.validate.md`
   - `implement` → none (per Integration Point 2, implement uses per-task commits, not `.partial`)

   For each match, run `adev partial inspect --artifact <partial-path>` to fetch `{partial_exists, schema_marker, schema_allowed, lock_exists}`. Decision matrix:

   - **`--auto` mode AND `schema_allowed` is true:** resume — pass the partial as additional context to the dispatching subagent.
   - **`--auto` mode AND `schema_allowed` is false (missing/mismatched marker):** discard with a logged warning and start fresh: `adev partial discard --artifact <partial-path> --spec <spec-path>`. Never silently overwrite.
   - **Interactive mode:** prompt the user — **resume / discard / abort**. Resume re-dispatches with the partial as context; discard runs the CLI discard call; abort stops the build for manual inspection.
   - **`lock_exists` is true with a live owner:** another invocation is in flight. Abort the build with a clear message naming the pid and lock file. The user can re-run after the prior invocation completes.

   If no `.partial` exists for the step, proceed normally.

4. **Dispatch ONE subagent.** Dispatch exactly one subagent via the Agent tool for the determined step, always with `run_in_background: false` (see Subagent Dispatch Model). Wait for its STEP_RESULT.

5. **Record result. (MANDATORY — this step uses a programmatic helper to prevent skipping.)**

   After the subagent returns its STEP_RESULT, **immediately** run this CLI call to persist the result. Do NOT print anything to the user, do NOT summarize, do NOT respond — run this call FIRST:

   ```bash
   adev build-state record --spec <SPEC_PATH> --step <STEP_NAME> \
     --status <completed|failed> \
     --verdict <VERDICT> \
     [--error <ERROR>] [--notes <SUMMARY>]
   adev build-state next --spec <SPEC_PATH>
   ```

   This is MANDATORY even if the subagent reported ALREADY_COMPLETE or similar — any COMPLETED status means the step succeeded. The helper atomically writes the state file and recalculates build status.

6. **Cost ticker between steps (cost-ticker.spec.md Behaviors 8 + 9).** After the just-completed step in `{review, plan, route, implement, validate}` has been recorded in step 5 and **before** dispatching the next step, invoke the cost ticker:

   ```bash
   # Interactive mode (default — ticker prints to stderr for visibility):
   ADEV_BUILD_TICKER=1 adev cost summary --spec <SPEC_PATH> --include-checkpoints

   # --auto mode (suppress informational output; cost-warn lines still surface on stderr):
   ADEV_BUILD_TICKER=1 adev cost summary --spec <SPEC_PATH> --include-checkpoints --quiet
   ```

   The ticker is informational. A non-zero exit from the verb does NOT block the build — record the ticker invocation outcome in build state if useful and continue to the next step.

   **Per-build cost-warn dedup (SA-1 resolution from review).** The verb itself does NOT dedup `[cost warn]` lines across invocations. The orchestrator owns the dedup contract: after the first `[cost warn]` line is observed for a `(spec, threshold)` pair, set a `cost_warn_emitted` boolean for the spec in `build-state.json` (or an equivalent in-memory marker for the duration of the build). Subsequent ticker invocations for the same spec suppress the `[cost warn]` line — pipe the verb's stderr through a filter that drops `[cost warn] spec cost` lines when the flag is true, or run the verb without redisplaying the warn line. The flag resets at the start of each new build.

   Skip this section entirely for the `specify` step (cost ticker scopes to `{review, plan, route, implement, validate}` only).

7. **Re-invoke or stop. (CRITICAL — do NOT skip this step.)**
   - If `next` from step 5 is non-null AND no stop condition is met: print a one-line progress report (`"Step N (<name>) completed — <verdict>. Next: Step N+1 (<name>)."`) and **immediately** re-invoke `/adev:build --resume --spec <path>` via the Skill tool. If `--tier <t>` was set for this build, carry it forward on the re-invocation (`--resume --spec <path> --tier <t>`) — it is not persisted in build state, so omitting it on a resumed turn silently drops the rigor signal for any remaining review/validate dispatch. The re-invocation starts a fresh turn with a clean context — it has no memory of the current turn. **Ending your response without re-invoking is a build failure.**
   - If `next` is null or `buildStatus` is `"completed"` or `"failed"`: do NOT re-invoke. Print the final summary and exit without re-invocation.
