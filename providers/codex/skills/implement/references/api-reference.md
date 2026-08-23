## API reference

Lifecycle event log (gates, step tracking, debug interventions, plan-task channel):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — reads the per-spec JSONL log and returns a `StateProjection`: `{ spec, status, currentStep, currentTask, steps, planTasks, interventions, startedAt, updatedAt }`.
- `requireGate(state, "plan", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns, in advisory mode) when the `plan` step is not complete.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default).
- `reportStep(projectRoot, specPath, { step, status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `lifecycle_step` event at skill entry/exit.
- `reportIntervention(projectRoot, specPath, { kind, note })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `debug_intervention` event when implementation hits a recoverable obstacle (rerouted to `/adev:debug`, prompt edits, etc.).
- `reportPlanTask` and `state.planTasks` — plan-task state transitions are owned by this skill per `plan-task-events.spec.md`. See that spec for the full transition semantics (`pending` → `in_progress` → `completed` / `blocked`). This skill does NOT mutate plan-file checkboxes; the plan file is read-only after authoring.

Execution state:

- `readExecutionState(projectRoot)` / `writeExecutionState(projectRoot, state)` / `clearExecutionState(projectRoot)` from `<ADEV_ROOT>/lib/execution-state.mjs` — read/write/clear `.context-index/.execution-state.json` for cross-session resume tracking. Do not hand-parse the JSON.

Issue board:

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter for epic-level work-item tracking (per-task issues are forbidden by the board-granularity invariant).
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
