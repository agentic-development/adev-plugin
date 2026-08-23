## API reference

Lifecycle event log (gating between sub-skills, step events, next-step discovery for resume):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection (`steps`, `currentStep`, `planTasks`, `interventions`).
- `requireGate(state, "<prior-step>", { mode })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — hard-blocks (or warns) before dispatching each sub-skill.
- `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — resolves `manifest.lifecycle.gate_mode` (`strict` default, or `advisory`).
- `reportStep(projectRoot, specPath, { step, status, verdict?, totals?, model_breakdown?, skipped_lines? })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emit step entry/exit so the next turn's `currentState` is fresh. Cost fields are optional and only included in `step_completed` events.
- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregate per-spec projections (used by milestone-mode and the no-args resume scan).

Build orchestrator resume cache:

- `readBuildState`, `createBuildState`, `recordStepResult`, `getNextStep` from `<ADEV_ROOT>/lib/build-state.mjs` — programmatic resume state. The helper owns its on-disk shape; skill prose does not manipulate its underlying storage directly.

Execution state (cross-session resume tracking):

- `readExecutionState`, `writeExecutionState`, `clearExecutionState` from `<ADEV_ROOT>/lib/execution-state.mjs` — `.context-index/.execution-state.json` for session-level resume.

Issue board (guarded by `tasks.backend` configuration):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter for epic-level work-item tracking.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
