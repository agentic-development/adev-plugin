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

If `tasks.backend` is configured:
1. Create an epic for the plan: call `createEpic({ title: "<plan title>", planRef: "<plan-file-path>" })` from `lib/issues/registry.mjs` (use `getIssueManager(manifest)` to get the active adapter).
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
