# Live Spec: Plan-Task Events in Lifecycle Log

<!-- Live Spec within the agent-reliable-state-artifacts charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/agent-reliable-state-artifacts/charter.md -->

---
charter: agent-reliable-state-artifacts
status: validated
risk_level: high
milestone: 0.26.0
revision: 1
charter-revision: 3
created: 2026-05-12
updated: 2026-05-12
source-manifest:
  sha: "a4cef4c"
  files:
    - lib/migrate-state-artifacts.mjs
    - lib/plan-immutability.mjs
    - skills/implement/SKILL.md
    - skills/plan/SKILL.md
    - tests/fixtures/plan-immutability/violation/.context-index/lifecycle-state/foo.jsonl
    - tests/fixtures/plan-immutability/violation/.context-index/manifest.yaml
    - tests/fixtures/plan-immutability/violation/.context-index/specs/features/x/foo.plan.md
    - tests/fixtures/plan-immutability/violation/.context-index/specs/features/x/foo.spec.md
    - tests/lib/migrate-state-artifacts.test.mjs
    - tests/skills/no-stale-format-refs.test.mjs
    - tests/skills/plan-task-immutability.test.mjs
  computed-at: "2026-05-12T18:02:31.778Z"
drift_detected: true
drift_source: tests/skills/plan-task-immutability.test.mjs
drift_at: 2026-05-15T17:47:59.024Z
---

## Behavioral Contract

This spec defines how `/adev:plan` and `/adev:implement` persist per-plan-task state after the JSON board and the lifecycle event log are in place. Today's behavior — one Issue per plan task on the board, plus a checkbox in the plan markdown that the skill mutates — is replaced by a single channel: `plan_task` events appended to the spec's `<slug>.jsonl` lifecycle log via `reportPlanTask`. The plan markdown is treated as an immutable input artifact after authoring: `/adev:implement` reads it for task definitions but never writes back to it (no checkbox flips, no inline state stamps). The issue board no longer carries per-task rows. The lifecycle log becomes the single source of truth for "what's the status of task t2 in spec foo".

This unblocks the board-granularity invariant declared by the charter and consumed by `json-issue-board-adapter.spec.md` (no Issue with `planRef` + `planTask`). It also closes the dual-write window where the plan checkbox, an Issue row, and execution state could disagree.

## Naming Conventions (CON-1)

- **Event field names** — snake_case per the canonical event schema in `lifecycle-event-log.spec.md`. `plan_task` events carry `plan` (absolute or `.context-index/`-relative path to the plan file), `task_id` (the plan's own task identifier like `t1`, `t2`), `status` (`pending` | `in_progress` | `done` | `blocked` | `skipped`), and optional `notes`.
- **StateProjection fields** — camelCase per the foundation spec. `currentState(spec).planTasks` is the map `{ <task_id>: { status, notes, updated } }` already established by `lifecycle-event-log.spec.md`.
- **Skill prose** — `/adev:plan`, `/adev:implement`, and `/adev:work` instructions refer to tasks as "plan tasks" (not "task issues" or "task rows") to reinforce the channel change.

Implementers must not invent new fields. If a future skill needs to carry extra metadata, it goes on `notes` (free-text, escaped at render boundary per `markdown-rendering-layer.spec.md`) or, if structured, becomes a new event variant in a follow-up spec.

## Authoritative-Channel Invariant (CON-8)

Plan-task state has exactly one writer surface and exactly one reader surface:

- **Writer:** `lib/lifecycle-state.mjs::reportPlanTask(projectRoot, specPath, { plan, task_id, status, notes })`. Both `/adev:plan` (when authoring the plan, emitting `pending` rows for each task) and `/adev:implement` (when transitioning a task through `in_progress` → `done` / `blocked` / `skipped`) call this helper. No other write path exists.
- **Reader:** `currentState(projectRoot, specPath).planTasks`. `/adev:implement`, `/adev:work`, `/adev:status`, `/adev:reconcile`, and the markdown rendering layer all read from the projection. No code path reads task state from the plan markdown.
- **Plan markdown is read-only after authoring.** `/adev:plan` writes the plan file once. `/adev:implement` reads it for the task list, expected complexity, and TDD expectations, but never edits it. No skill flips checkboxes, no skill appends "✅ done" inline.

If a consumer needs to render the plan with current task statuses, it uses `renderMarkdown(state)` from `markdown-rendering-layer.spec.md` to produce a derived markdown view from the projection; the plan file itself is unchanged.

## Plan Markdown Surface (CON-3)

The plan markdown format changes minimally:

- The "Tasks" section keeps its table or list structure for human readability.
- Each task row carries a stable `task_id` (typically `t1`, `t2`, …, matching today's convention) as its leftmost or anchor column.
- The trailing `Status` column (today's `[ ]` / `[x]` checkbox or "pending" / "done" text) is **removed from new plans** — status lives in the lifecycle log. For pre-existing plan files migrated by `one-shot-migration-tool`, the Status column is preserved as a frozen historical record and the migration tool stamps an advisory header on the plan file noting that status has moved to the lifecycle log.
- `/adev:plan` writes one `plan_task` event with `status: "pending"` for each task at plan-authoring time. This seeds the projection so `currentState(spec).planTasks` is populated as soon as the plan exists.

## `/adev:plan` Behavioral Changes

When `/adev:plan` runs (in any mode — spec, feature, release, milestone, epic):

1. After the plan file is written to `<spec-dir>/<spec-slug>.plan.md`, the skill iterates the Task Map and calls `reportPlanTask(projectRoot, specPath, { plan: planFilePath, task_id, status: "pending", notes: null })` once per task.
2. The skill does **not** call `getIssueManager(manifest).create({...})` for per-task issues. Per-task Issue creation is removed from the plan skill entirely.
3. Feature/Epic-level Issues (the charter-level work items created by `--feature` and `--epic` modes) continue to be created on the board — those are board-granularity items per the invariant. Only per-task Issue creation is removed.
4. If the spec already has plan-task events from a prior `/adev:plan` invocation on the same spec (re-planning), the skill prints a one-line advisory ("Re-plan detected: prior plan_task events remain in the lifecycle log as history. New events will append.") and proceeds. Re-planning never rewrites old events — they remain as the historical record per the append-only invariant.

## `/adev:implement` Behavioral Changes

When `/adev:implement` runs:

1. **Task discovery.** The skill reads the plan file for the task list (file is the source of truth for *what the tasks are*). It then calls `currentState(projectRoot, specPath).planTasks` for current status (the projection is the source of truth for *what state each task is in*).
2. **Task selection.** The skill picks the next task with `status: "pending"` (or `in_progress` if resuming an interrupted task). Order follows the plan file's task ordering and dependency declarations.
3. **State transitions.** Before starting a task, the skill calls `reportPlanTask(..., { task_id, status: "in_progress", notes: null })`. On task completion (GREEN + REFACTOR done), it calls `reportPlanTask(..., { task_id, status: "done", notes: <optional 1-line summary> })`. On a blocker that the skill cannot resolve, it calls `reportPlanTask(..., { task_id, status: "blocked", notes: <blocker description> })` and proceeds to the next task or exits per existing blocker semantics. Skipped tasks (e.g., user declines optional REFACTOR) get `status: "skipped"`.
4. **No plan-file mutation.** The skill does not edit the plan markdown. Old prose in skill instructions ("check the box on the task you just finished") is removed by `lifecycle-skill-instruction-updates.spec.md`.
5. **No per-task Issue updates.** The skill does not call `getIssueManager(manifest).update(<task-issue-id>, ...)`. Feature/Epic-level Issue updates (e.g., flipping a Feature Issue to `in_progress` on first task start) continue per existing semantics — those are board-granularity items.

## Migration / Backfill (CON-5)

Existing projects with per-task Issues on the board and stale checkboxes in plan files are handled by `one-shot-migration-tool.spec.md`'s extension (see `issue-board-granularity-cleanup.spec.md` for the migration step that owns this). This spec defines only the post-migration behavior. For a project where `adev migrate` has been run, the invariants above apply from the next `/adev:plan` invocation forward.

## System Constitution Reference

- **Principle:** "Hook protocol compliance" — Applies indirectly: the lifecycle log writes from these skills are subprocess calls into `lib/lifecycle-state.mjs`, never inline hook protocol messages.
- **Principle:** "Skills are primarily markdown" — Applies because the behavior change is a skill instruction rewrite plus a single helper call per task transition. No new library code beyond what `lib/lifecycle-state.mjs` already exports.
- **Principle:** "Pure ESM" — Applies because the helper calls go through `lib/lifecycle-state.mjs` (already ESM).
- **Architecture Boundary (Autonomous):** "Editing skill markdown content" — Applies. The behavior change is mechanically a SKILL.md rewrite for `/adev:plan` and `/adev:implement` plus a small amount of test scaffolding.
- **Architecture Boundary (Requires Human Approval):** "Adding new skills to the lifecycle order" — Does NOT apply. No new skill is introduced. Behavior of existing skills changes; their position in the lifecycle order is unchanged.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| `/adev:plan` SKILL.md rewrite — task emission | Remove the "create one Issue per plan task" section. Add the `reportPlanTask(..., { status: "pending" })` loop after plan file is written. Applies to base SKILL.md and the `feature-mode`, `epic-mode`, `release-mode` companion files. | medium |
| `/adev:plan` re-plan advisory | Add the re-plan detection block (check for prior `plan_task` events via `filterEvents`; emit one-line advisory). | small |
| `/adev:implement` SKILL.md rewrite — task discovery + transitions | Remove every "check the box" / "update the Issue for this task" instruction. Add the `currentState(...).planTasks` read for status. Add `reportPlanTask` calls at task start, done, blocked, skipped. | medium |
| Plan template update | Remove the trailing `Status` column from new plan files. Update the template at `templates/plan-template.md` (or wherever the plan stencil lives). | small |
| Migration-tool advisory header | `one-shot-migration-tool` extension: for each pre-existing plan file under `.context-index/specs/`, prepend a one-line HTML comment header `<!-- DO NOT EDIT statuses inline — see lifecycle log <slug>.jsonl -->`. Idempotent; skip if header already present. | small |
| Architectural test: plan files are immutable post-authoring | A test that walks `.context-index/specs/**/*.plan.md`, parses out the file SHA at the time of the last `plan_task` "pending" event in each sibling lifecycle log, and asserts the plan file content has not changed since. Runs in CI. | medium |
| Architectural test: no `getIssueManager().create` from `/adev:plan` for per-task issues | Static check over `skills/plan/SKILL.md` and mode files: greps for `create(` calls that pass `planTask:` and fails if any are found. | small |
| Unit tests: `reportPlanTask` round-trip | Existing `lib/lifecycle-state.mjs` tests already cover the API. Add a fixture-level integration test driving the new `/adev:plan` and `/adev:implement` flows end-to-end against a temp project. | medium |

## Acceptance Criteria

- [ ] `/adev:plan` (all modes) emits exactly one `plan_task` event per task in the plan file, with `status: "pending"`.
- [ ] `/adev:plan` does not create per-task Issues on the board. Feature- and Epic-level Issues are still created as before.
- [ ] `/adev:implement` reads task status only from `currentState(spec).planTasks`. Greps over the skill files find no remaining instructions to read status from plan markdown.
- [ ] `/adev:implement` emits `plan_task` events at start (`in_progress`), completion (`done`), blocker (`blocked`), and skip (`skipped`). No other code path writes `plan_task` events.
- [ ] Plan markdown files are not mutated by `/adev:plan` or `/adev:implement` after initial authoring. The architectural test enforces this.
- [ ] Re-planning a spec is non-destructive: prior `plan_task` events remain in the lifecycle log; the user sees the advisory.
- [ ] Migration tool stamps the "DO NOT EDIT inline" header on pre-existing plan files exactly once (idempotent).
- [ ] All quality gates pass (tests, lint, typecheck).
- [ ] No constitutional violations introduced.
