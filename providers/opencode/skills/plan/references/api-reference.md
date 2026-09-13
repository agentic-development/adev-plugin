## API reference

Lifecycle event log (gates, step tracking, plan-task channel):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — reads the per-spec JSONL log and returns a `StateProjection`: `{ spec, status, currentStep, currentTask, steps, planTasks, interventions, startedAt, updatedAt }`.
- `requireGate(state, "review", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns, in advisory mode) when the prior step is not complete. Throws `GateError` in strict mode.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default, or `advisory`).
- `reportStep(projectRoot, specPath, { step, status, verdict? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `lifecycle_step` event at skill entry (`status: "started"`) and exit (`status: "completed"`).
- `reportPlanTask(projectRoot, specPath, { taskNumber, title, status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `plan_task` event. Owned by this skill for `pending` emission; transitions are owned by `/adev:implement`.

Issue board (cross-reference; the plan skill no longer creates per-task issues — see `plan-task-events.spec.md`):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active issue adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest loader:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
