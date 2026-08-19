## Mode: Resume

When `--resume` is invoked, the skill resumes an interrupted or failed build from the last successful step. Next-step discovery is driven by `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — the lifecycle projection's `currentStep` and per-step `status` are authoritative. The build-orchestrator's own resume cache (via `lib/build-state.mjs`) supplements with build-level metadata (`milestone`, retry counters), but the lifecycle log decides what to do next.

### Resume without `--spec` or `--milestone`

Call `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` and filter for projections where the orchestrator has not yet reached `validate, status: completed`. Cross-reference with `lib/build-state.mjs::readBuildState` for any build records with `status: in_progress` or `status: failed`. If multiple resumable specs are found, list them and ask the user which to resume. If none are found, print:

> No interrupted build found. Nothing to resume.

### Resume with `--spec <path>`

Call `currentState(projectRoot, specPath)`. The next step to dispatch is the one whose `state.steps[name]` is missing or non-completed in pipeline order (`specify` → `review` → `plan` → `route` → `implement` → `validate`). Before dispatching, run `requireGate(state, "<prior-step>", { mode })` to confirm the prior step actually passed.

### Resume with `--milestone <name>`

Re-discover all specs with `milestone: <name>` in their frontmatter by scanning `.context-index/specs/`. Do NOT rely solely on the orchestrator's resume cache -- specs may have been added or modified between sessions. For each discovered spec, call `currentState(projectRoot, specPath)`:

- If the projection shows in-progress work (some steps complete, some pending), resume from the next step after the last completed one (using `requireGate` to confirm gating).
- If the projection shows all steps complete through `validate`, skip that spec.
- If no lifecycle log exists yet for the spec, start a fresh build (entering at `specify` or `review` per the pipeline mode).

### The `--from <step>` Override

When `--from <step>` is combined with `--resume`, force the build to restart from the specified step regardless of what the lifecycle log says. Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`.

This is a safety valve for situations where:
- The build cache is corrupted
- External changes have invalidated a previously-completed step
- The user wants to re-run a step that passed but produced suboptimal results

When `--from` is used, the orchestrator emits a `reportStep` event marking the override and dispatches the requested step regardless of `requireGate` (operator-acknowledged bypass).

Valid step names: `specify`, `review`, `plan`, `route`, `implement`, `validate`. Note: `specify` is only applicable in Full Pipeline builds; using `--from specify` on an Implement Pipeline build dispatches specify (which may update the spec) — use with care.

## API reference

Lifecycle event log (primary source of pipeline position for resume):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — projection with `currentStep`, `steps`, `planTasks`. Authoritative for next-step discovery.
- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregate of per-spec projections for the no-args resume scan.
- `requireGate(state, "<prior-step>", { mode })` and `resolveGateMode(loadManifest(projectRoot))` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — confirm the prior step passed before dispatching the next.

Build orchestrator resume cache (supplements lifecycle log with build-level metadata):

- `readBuildState`, `recordStepResult` from `<ADEV_ROOT>/lib/build-state.mjs`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs`.
