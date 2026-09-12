# Live Spec: Issue Board Granularity Cleanup

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: review-passed
risk_level: high
milestone: 0.26.0
revision: 1
charter-revision: 3
created: 2026-05-12
updated: 2026-05-12
---

## Behavioral Contract

This spec finishes the board-granularity story started by `json-issue-board-adapter.spec.md` (which already rejects new writes that would set both `planRef` and `planTask`) and `plan-task-events.spec.md` (which removes per-task Issue creation from `/adev:plan`). What remains is the **migration-time cleanup** of existing per-task Issue rows and the **skill-instruction reinforcement** that prevents regressions in the rest of the lifecycle skills.

After this spec lands, the post-migration invariant of the charter holds project-wide: no Issue on the board carries both `planRef` and `planTask`. Plan-task state lives exclusively as `plan_task` events in the per-spec lifecycle log. The board carries only epic-level, feature-level, and bug-level rows. The cleanup is one-shot (executed by `adev migrate`), idempotent (re-running yields no further change), and lossless (every per-task Issue's status, notes, and timestamps survive as a synthesized `plan_task` event in the appropriate `<slug>.jsonl`).

## Migration Step: Collapse Per-Task Issues

Extends `lib/migrate-state-artifacts.mjs` with a new step, ordered after the `tasks.md → tasks.json` conversion and after the build-state → lifecycle-state rename, before the migration is reported complete:

1. **Scan** the migrated `tasks.json` for Issues where both `planRef` and `planTask` are non-null (i.e., per-task rows that the legacy `/adev:plan` created).
2. **Group** matching Issues by `planRef`. Each group corresponds to one plan file and, transitively, one spec.
3. **Resolve spec path.** For each plan file path (`<spec-dir>/<spec-slug>.plan.md`), the sibling spec file is `<spec-dir>/<spec-slug>.spec.md`. If no sibling spec exists, log a `PLAN_WITHOUT_SPEC` advisory and skip that group (these are typically `release` / `milestone` plans authored before per-spec lifecycle logs were introduced; they require operator review).
4. **Synthesize** one `plan_task` event per Issue in each group, appended to the spec's `<slug>.jsonl` via `appendEvent` (not `reportPlanTask`, to preserve historical timestamps):
   - `ts` ← Issue `updated` (or `created` if `updated` is absent)
   - `event` ← `"plan_task"`
   - `plan` ← Issue `planRef`
   - `task_id` ← Issue `planTask`
   - `status` ← derived: Issue `closed` → `"done"`; Issue `in_progress` → `"in_progress"`; Issue `open` → `"pending"`; Issue `blocked` → `"blocked"`; anything else → `"pending"` with a `notes` annotation `"legacy status: <orig>"`
   - `notes` ← concatenation of Issue `notes` + `next_action` if both present, else whichever is present, else `null`
   - `migrated_from_issue` ← Issue `id` (new optional field on the `plan_task` variant — preserved on read, ignored by core projection per the open-schema rule from `lifecycle-event-log.spec.md`)
5. **Remove** the now-migrated Issues from `tasks.json`. The board document is rewritten via the existing atomic write path.
6. **Record** a migration manifest entry at `.context-index/.migration-state-artifacts.json` (the same file the existing one-shot tool writes) listing per-spec event counts and the source Issue IDs, for auditability and to make the step idempotent on re-run.

The step is **idempotent**: on re-run, the scan in (1) finds no per-task Issues (because step 5 removed them on the first run) and exits without action. If `.migration-state-artifacts.json` already records a `plan_task_collapse` entry, a second invocation logs `ALREADY_COLLAPSED` and skips even the scan.

## Migration Step: Dependency Edge Re-pointing

Issues removed in step 5 above may have been dependency targets (an open feature-level Issue might depend on `issue-42` which was a per-task row). The migration re-points dependencies:

- For each removed per-task Issue, find any Issue with that ID in its `deps` array.
- Replace the dependency on the per-task Issue with a single dependency on the **feature-level Issue** that shares the same `spec_ref` (resolved by walking from the per-task Issue's `planRef` → its sibling spec file → the Feature Issue created by `/adev:specify` for that spec).
- If multiple feature-level Issues share the spec ref, pick the most recently updated and log a `MULTI_FEATURE_FOR_SPEC` advisory.
- If no feature-level Issue exists for the spec, drop the dependency edge entirely and log `DROPPED_DEP` with the source Issue ID. Operators can re-create dependencies post-migration if needed.

This preserves the dependency-graph shape at the granularity the board now operates on.

## Adapter Enforcement (Already in json-issue-board-adapter; Reinforced Here)

`lib/issues/json-adapter.mjs` already rejects `create` / `update` calls that would land an Issue with both `planRef` and `planTask`. This spec adds a **post-migration enforcement test** to CI:

- An architectural test loads `.context-index/tasks/tasks.json` (when present in the repo under audit), asserts no Issue has both fields set. Fails CI if any are found.
- The same test runs against synthetic migration fixtures (legacy `tasks.md` with per-task rows → migrated `tasks.json`) to verify the cleanup step works end-to-end.

## Skill Instruction Reinforcement

The following skills receive instruction-level guards (full SKILL.md rewrites are owned by `lifecycle-skill-instruction-updates.spec.md`; this spec contributes the granularity-specific guards):

- **`/adev:work`** — the "create an Issue for this work" prompt is amended: if the user describes a plan task (matches pattern `<plan-path> task <id>` or similar), the skill prints "Plan tasks live in the lifecycle log, not on the board — use `/adev:implement` to track them" and exits without creating an Issue.
- **`/adev:specify`** — the Step 5.6 ("Create Feature Work Item") guard is reinforced: the created Issue has `type: "feature"` and never carries `planRef` + `planTask` (it only carries `spec_ref`).
- **`/adev:reconcile`** — gains a new repair operation, `collapse-per-task-issues`, that runs the migration step's logic on demand against the current board. Useful for fixing partial post-migration regressions or boards that pre-date the cleanup.

## Naming Conventions (CON-1)

- Reuses the Issue, Epic, and event-name conventions from `json-issue-board-adapter.spec.md` and `lifecycle-event-log.spec.md` verbatim. No new fields except the optional `migrated_from_issue` on `plan_task` events (snake_case, per the canonical event schema).

## Path Safety (SEC-1)

The migration step writes to `<slug>.jsonl` files and to `tasks.json`. Both write paths already enforce the realpath-prefix containment checks established by `lifecycle-event-log.spec.md` and `json-issue-board-adapter.spec.md`; no new path-safety primitive is introduced. The step uses those libs' public writers (`appendEvent`, `JsonAdapter._write` via update/close paths) and inherits their containment guarantees.

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Applies because the migration step uses only the already-exported APIs of `lib/lifecycle-state.mjs` and `lib/issues/json-adapter.mjs`. No new dependencies.
- **Principle:** "Pure ESM" — Applies. The migration step is added to `lib/migrate-state-artifacts.mjs` (already ESM).
- **Architecture Boundary (Autonomous):** "Refactoring within a module's boundaries" — Applies. The collapse step is internal to `agent-reliable-state-artifacts`.
- **Architecture Boundary (Requires Human Approval):** "Changing the plugin registration format" — Does NOT apply. No registration changes.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `collapsePerTaskIssues(projectRoot)` migration step | New function in `lib/migrate-state-artifacts.mjs`. Implements steps 1–6 above. Idempotent. | medium |
| Dependency edge re-pointing helper | Internal helper invoked by step 6. Walks deps arrays and substitutes feature-level Issue IDs. | small |
| `.migration-state-artifacts.json` manifest extension | Add `plan_task_collapse: { runs: [{ ts, specs_touched, issues_removed, advisories }] }` section. | small |
| `adev migrate --dry-run` support | The new step participates in dry-run mode: prints the planned changes per spec without writing. | small |
| Architectural test: post-migration board invariant | Walks the project's `tasks.json` (if present) and asserts no Issue has both `planRef` and `planTask`. CI gate. | small |
| Migration fixture tests | Synthetic legacy `tasks.md` with per-task rows; assert post-migration JSONL contains the expected events and the board contains only feature-level rows. | medium |
| `/adev:work` plan-task guard | Skill instruction update: detect plan-task descriptions and redirect to `/adev:implement` instead of creating an Issue. | small |
| `/adev:reconcile collapse-per-task-issues` operation | New repair option in the skill: invokes `collapsePerTaskIssues` against the current board, surfaces advisories. | small |
| End-to-end migration test | `adev migrate` against a fixture project with mixed per-task Issues and a partial lifecycle log; assert idempotence, dependency re-pointing, and advisory output. | medium |

## Acceptance Criteria

- [ ] After `adev migrate` runs on a legacy project, `tasks.json` contains no Issue with both `planRef` and `planTask`.
- [ ] Every collapsed per-task Issue has a corresponding `plan_task` event in the appropriate `<slug>.jsonl` with the same `task_id`, derived status, original timestamp, and `migrated_from_issue` set to the source Issue ID.
- [ ] Dependency edges from non-collapsed Issues are re-pointed to feature-level Issues by spec, or dropped with a `DROPPED_DEP` advisory.
- [ ] Re-running `adev migrate` on an already-migrated project produces no further changes (idempotence verified by diff = empty).
- [ ] `adev migrate --dry-run` prints the planned per-spec event additions and Issue removals without writing.
- [ ] The architectural test asserting "no Issue has planRef + planTask" passes on the project's current board and on all migration fixtures.
- [ ] `/adev:work` redirects plan-task-shaped Issue requests to `/adev:implement` and does not create an Issue.
- [ ] `/adev:reconcile collapse-per-task-issues` is invokable and idempotent.
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
