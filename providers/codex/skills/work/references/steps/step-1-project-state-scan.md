## Step 1: Project State Scan

Scan for in-progress work using **parallel** tool calls in a single round:

1. **In-progress execution state:** Call `readExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs`. If `status === "active"` or `status === "blocked"`, the project has resumable work — surface the `planRef`, `currentTask`, and any `blockers` to the user.

2. **Plan task projection:** For each plan referenced by an existing lifecycle log, call `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` and inspect `state.planTasks`. Tasks with `status === "pending"` or `status === "in_progress"` are open. **Do not grep plan files for `- [ ]` checkboxes** — the plan file is read-only after authoring; canonical task status lives in the lifecycle log. (Plan-task channel ownership is defined in `plan-task-events.spec.md`; redirect plan-task work to `/adev:implement`, which is the only writer.)

3. **Pipeline status overview:** Call `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` to aggregate per-spec lifecycle states across the project. Specs whose `currentStep` is `specify` with `status: "completed"` but no `review` step are "unreviewed."

4. **Recent sessions:** Glob for `.context-index/sessions/*.md`. Read the 3 most recent files (sorted by filename date prefix, descending). Extract the session summary line.

5. **Concurrent work by others (pre-flight scan):** Signals 1-4 are worktree-local and cannot see another agent. Run the shared-signal scan:

   ```bash
   adev coordination scan
   ```

   It reports open PRs, recently-active remote branches, and issues sitting at `in_progress` under an owner other than yours (add `--json` when you need the structured report, `--owner <name>` when `$ADEV_ISSUE_OWNER` is not set). Interpret the result:
   - **Anything listed that overlaps the work at hand** — an open PR, a branch, or an in-progress issue on the same subject — must be surfaced to the user *before* routing, naming the PR number / branch / issue id. Someone may already be doing this.
   - **`none detected`** — proceed.
   - **`(not scanned — …)`** — a signal degraded (no `gh`, unauthenticated, no GitHub remote, no git). This is normal and never blocks the scan; treat the missing signal as unknown, not as absence of concurrent work.

   The verb always exits 0 when the scan completes; a non-zero exit means a usage error, not a finding.

### If in-progress work is found

Surface it, and **propose the concrete next step** — not just "resume?". For each in-progress item, compute its next lifecycle action using the Next-Step Projection table (Step 3), then lead with the single most relevant one:

> I found in-progress work:
> - **hooks** plan: 3/7 tasks incomplete → next: **`/adev:implement`** (continue the plan)
> - **design** spec `drag-drop.md`: specified but unreviewed → next: **`/adev:review-specs`**
> - Recent session (2026-03-28): "Implemented auth login flow"
> - Concurrent: PR #214 `fix/issue-582` (agent-a) and `issue-582` in progress under owner `agent-a`
>
> Want me to continue with `/adev:implement` on **hooks**, pick another, or start something new?

Wait for the user's response before proceeding. If the user says "continue", "resume", "what's next", or gives no new description, route directly to the projected next step for the most recently active item (see Step 3) — do not re-ask what to work on.

### If no in-progress work is found

Proceed directly to Step 2.

### Error handling

- If a file is missing during the scan, skip it silently (normal — not all projects have sessions or plans).
- If a file is present but malformed or unreadable, skip it and emit a visible warning: "Skipped one file that could not be read: `<path>`."

