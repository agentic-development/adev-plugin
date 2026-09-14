## Step 7: Execution Handoff

**Update charter Capability Map:** After saving the plan, read the parent charter and update the Capability Map. For each capability covered by this plan, set its `Status` column to `planned`.

**Emit plan-task `pending` events.** After the plan file is saved, walk the Task Map and emit one `pending` event per task into the spec's lifecycle log. This seeds the projection so `currentState(spec).planTasks` is populated as soon as the plan exists.

```javascript
import { reportPlanTask, filterEvents } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

// Re-plan detection: if the spec already has plan_task events for this plan,
// print a one-line advisory. Existing events remain as history (append-only).
const priorPending = filterEvents(projectRoot, specPath,
  e => e.event === 'plan_task' && e.plan === planFilePath);
if (priorPending.length > 0) {
  console.warn(
    'Re-plan detected: prior plan_task events remain in the lifecycle log as history. New events will append.'
  );
}

for (const task of plan.tasks) {
  reportPlanTask(projectRoot, specPath, {
    plan: planFilePath,
    task_id: task.id,
    status: 'pending',
    notes: null,
  });
}
```

Per-task Issue creation is removed entirely — the skill no longer constructs `create(...)` calls carrying a `planTask` reference. The board-granularity invariant (`agent-reliable-state-artifacts/charter.md`) requires plan-task state to live in the lifecycle log, not as Issues on the board.

**Issue creation (optional, board-granularity only):** Read `tasks.backend` from `manifest.yaml`.

If `tasks.backend` is configured, create an epic for the plan, passing a one-line summary drawn from the plan document's Goal line as `--notes`:

```bash
adev issues epic "<plan title>" --plan-ref "<plan-file-path>" --notes "<one-line summary of the plan's stated goal>"
```

Do not reuse the `"Charter: <module>"` / `"Release: <name>"` tag convention from feature-mode / release-mode for this `--notes` value — `"Charter: <module>"` is a lookup tag `/adev:specify` Step 5.6-3 queries to resolve a parent Epic, and `"Release: <name>"` is release-mode's own umbrella-Epic tag consumed only by its own `walkTree` flow; neither applies to this plan-level epic.

`adev issues epic` is the only verb that writes to the epic store the board reads. `adev issues create` lands the record in the issue store instead, where `/adev:implement` and `/adev:reconcile` will never find it — so they mint a duplicate epic on every run.

Pass no spec ref on this call: the epic record has no spec-ref field, so the value would be dropped silently. The spec link lives on the spec and plan artifacts, not on the epic.

Never invoke the backend binary (`br create`, …) directly. `adev issues epic` resolves the storage root from the git common dir, so an epic created inside a linked worktree lands on the one real board; a raw `br` call resolves `.beads/` from the current directory instead and fails with `SYNC_CONFLICT`, because a worktree carries a git-tracked `issues.jsonl` with no `beads.db` beside it.

Then:
1. Record the epic id printed by the verb (`Created epic <id>: <title>`); pass `--json` if you need the full record.
2. **Do NOT create per-task Issues.** Plan-task state is tracked via `reportPlanTask` (above), not as Issues. Feature- and Epic-level Issues created by `--feature` / `--epic` / `--release` modes are unchanged — those are board-granularity items.
3. Report: "Created epic `<epic-id>`. Plan-task state lives in the lifecycle log at `.context-index/lifecycle-state/<slug>.jsonl`."

If `tasks.backend` is not configured in the manifest, skip epic creation entirely (plan-task events are still emitted to the lifecycle log).

After the plan is saved and reviewed, present the user with next steps. **Do NOT echo the full plan content in the conversation** — the plan is already on disk at the file path. Present ONLY this summary:

```
Plan complete and saved to <path to plan file>.

<N> tasks covering <M> acceptance criteria from the spec.
<S> tasks tagged with specialist routing.

Next: /adev:route --plan <path>
  Scores each task on a four-dimensional routing matrix and writes a
  `<plan-stem>.routing.json` sidecar that /adev:implement reads to decide
  auto-agent / assisted-agent / human-only execution per task.
Then: /adev:implement --plan <path>
To review the plan: open <path to plan file>
To re-plan after spec changes: /adev:plan --spec <path>
```

**Persona adaptation:** The format above is the default for the Developer persona. If a different persona is active, adapt accordingly — but never repeat the full plan content.
