## API reference

Lifecycle event log (the primary source for spec status, review verdicts, and re-review detection):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — single-spec projection.
- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregate per-spec lifecycle states across the project (used by `--all` and the Specs Needing Re-Review scan).

Issue board (board-level work-item aggregation):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Amendment graph (base↔amendment relationships and effective revision):

- `reportRelationship(projectRoot, specPath)` from `<ADEV_ROOT>/lib/amendment-graph.mjs` — for a spec carrying `amends:`, returns `{ isAmendment, amends, targetRevision, amendmentStatus, baseExists, line }`. Render the `line` (e.g. "amends `<base>` targeting rev `<N>`, status `<amendment-status>`") in the per-spec view when `isAmendment` is true.
- `computeEffectiveRevision(projectRoot, baseSpecPath)` from `<ADEV_ROOT>/lib/amendment-graph.mjs` — returns `{ baseRevision, effectiveRevision, validatedAmendments, pendingAmendments }`. Effective revision = `max(base.revision, highest target-revision among VALIDATED amendments)` (SA-2). Render the effective revision alongside the base spec's own `revision:`; pending/unvalidated amendments are listed but excluded from the max. The base file is never rewritten.
- `resolveAmendmentChain(projectRoot, specPath)` from `<ADEV_ROOT>/lib/amendment-graph.mjs` — returns `{ chain, cycle, cycleCode, danglingAt }`; render the full chain for an amendment-of-an-amendment, and report `AMENDMENT_CYCLE` instead of looping when `cycle` is true.

Milestones:

- `getMilestoneStatusData(projectRoot, name)` from `<ADEV_ROOT>/lib/milestones.mjs` — reads `.context-index/milestones.json`.

Source-manifest drift:

- `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` — drift detection on `source-manifest` blocks.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
