---
status: approved
revision: 8
updated: 2026-05-19
---

# Feature Charter: agent-reliable-state-artifacts

## Business Intent

Agent-mutated state in the adev framework lives in three formats today: markdown tables (`tasks.md`, charter capability maps), YAML frontmatter with markdown bodies (`.execution-state.md`), and ad-hoc YAML (`milestones.yaml`). All three are fragile under LLM-mediated updates — research confirms agents misparse columns, drop fields on regeneration, and accumulate multi-format compatibility branches (the 12/13/14-column issue rows in `lib/issues/file-adapter.mjs` are the worst case). The `agent-reliable-state-artifacts` module replaces these with JSON for relational state (the issue board) and per-spec JSONL append-only event logs for lifecycle state, with markdown rendered on demand for human inspection. The goal is to eliminate the entire class of "agent overwrites the file and loses data" bugs by making the file format itself resistant to it, while preserving every existing semantic contract (issue lifecycle, spec gates, milestone definitions). This module owns *how* state is persisted; sibling charters (`task-management`, `spec-lifecycle`, `session-awareness`, `milestone-lifecycle`) retain ownership of *what* the data means.

### Ownership Note

This module supersedes the storage-format decisions of four existing charters:

- **`task-management`** — owns issue lifecycle, tiered IDs, `IssueManagerInterface`. Storage format and on-disk schema for `tasks.json` are now owned here. Next revision of that charter should reference this module for the format contract.
- **`spec-lifecycle`** — owns source manifests, capability status, `/adev:status`. Build-state location and event log format are now owned here. The `.context-index/build-state/` directory rename is performed by this charter's migration tooling.
- **`session-awareness`** — owns execution-state semantics. The format of `.execution-state.md` (now `.execution-state.json`) and the bash-hook decoupling are owned here.
- **`milestone-lifecycle`** — owns milestone definitions and ship strategies. The format of `milestones.yaml` (now `milestones.json`) and the new `lib/milestones.mjs` wrapper are owned here.

This module does NOT change *what* state is tracked, the issue lifecycle, the gating semantics, or the spec/milestone contracts. It changes only *how* state is persisted.

**Board-granularity invariant ownership:** The post-migration invariant "no Issue has both `planRef` and `planTask`" (Scope and Invariants below) is *defined* by this charter but *enforced* by `lib/issues/json-adapter.mjs` (spec `json-issue-board-adapter`). The lifecycle event log module (`lib/lifecycle-state.mjs`, spec `lifecycle-event-log`) is the canonical home for `plan_task` events. The two specs together form one contract: plan-task state lives exclusively in the lifecycle log; the adapter refuses to persist it on Issues.

## Scope and Boundaries

### In Scope

- **JSON issue board** — `.context-index/tasks/tasks.json` replaces `tasks.md`. Schema: `{version, epics[], issues[]}`. Atomic writes via temp-then-rename (existing `lib/build-state.mjs` pattern).
- **JSON adapter** — `lib/issues/json-adapter.mjs` implementing the unchanged `IssueManagerInterface`. Registered as `backend: json` in manifest; becomes the default for new scaffolds.
- **JSONL per-spec lifecycle log** — `.context-index/lifecycle-state/<slug>.jsonl`. Append-only, multi-writer, heterogeneous events discriminated by `event` field. Replaces `.context-index/build-state/<slug>.json`. One file per spec contains all lifecycle events, plan-task events, reviewer/validator reports, debug interventions, and step transitions.
- **Severity stamped on actor events at write time** — `reviewer_report` and `validator_report` events carry `severity` resolved from existing `reviewers.yaml`/`gates.yaml` domain config once at write time. Reads never touch domain config.
- **Multi-writer aggregation** — `lib/lifecycle-state.mjs` exposes `currentState()` folding events into a state projection. Aggregation rule: any `blocker`/`error` severity returning `FAIL` ⇒ step fails; lower severities returning `FAIL` ⇒ `PASS_WITH_NOTES` on the step.
- **Lifecycle gates from state** — `requireGate(state, stepName)` replaces filesystem-grep of `.review.md` frontmatter. Hard-block by default; manifest knob `lifecycle.gate_mode: strict|advisory` softens to warning-only.
- **Plan task events in lifecycle log** — `/adev:plan` writes `plan_task` events instead of creating per-task issues on the board. `/adev:implement` reads and writes these events. Plan-file checkboxes are no longer mutated by skills.
- **Issue board granularity cleanup** — `/adev:plan` no longer creates one issue per task. Board entries are epic / feature-spec / bug level only. Post-migration invariant: no issue carries `planRef` + `planTask`.
- **Execution state migration** — `.execution-state.md` → `.execution-state.json`. `lib/execution-state.mjs` rewritten; `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh` invoke a Node helper rather than parsing inline YAML.
- **Milestones migration** — `.context-index/milestones.yaml` → `.context-index/milestones.json`. New `lib/milestones.mjs` wrapper using the atomic-write pattern. `/adev:issues milestone *` subcommands updated.
- **Directory rename** — `.context-index/build-state/` → `.context-index/lifecycle-state/`. Single-break rename done as part of the migration tool. Constitution Context Routing table updated.
- **One-shot migration tool** — `lib/migrate-state-artifacts.mjs` and `adev migrate` CLI subcommand convert a project's existing artifacts in one pass. Idempotent. Preserves ID counters, dependency edges, and beads-map.
- **Markdown rendering layer** — `lib/issues/render-markdown.mjs` and `lib/lifecycle-state.mjs::renderMarkdown` produce human-readable markdown from authoritative JSON/JSONL on demand. Surfaced via `adev status --render` CLI subcommand. Rendered files carry a "DO NOT EDIT — generated" header.
- **Lifecycle skill instruction cleanup** — every lifecycle skill's `SKILL.md` rewritten to call the adapter and `lib/lifecycle-state.mjs` APIs instead of describing markdown-table format. Affected skills: `adev:issues`, `adev:plan` (+ release-mode, epic-mode, feature-mode), `adev:implement`, `adev:work`, `adev:specify`, `adev:validate`, `adev:reconcile`, `adev:debug`, `adev:status`, `adev:hygiene`, `adev:research`, `adev:sync`, `adev:build` (+ resume-mode). Mirrored in `providers/codex/` and `providers/opencode/`.
- **Direct-fs consumer migration** — `viz/build.mjs` inline markdown parser replaced with adapter call. Bash hooks switched from inline parsing to Node helper invocation.
- **Test migration** — every fixture string and assertion against markdown-table or YAML format rewritten against JSON/JSONL. Format-evolution tests (12/13/14-column branches) replaced with schema-version tests.
- **Sibling charter amendments** — revisions to `task-management`, `spec-lifecycle`, `session-awareness`, and `milestone-lifecycle` charters that (a) reference this charter as the authority for storage format, (b) update normative paths from `.md`/`.yaml` to `.json`/`.jsonl` where applicable (e.g. session-awareness charter's `.execution-state.md` reference), and (c) note the format-ownership boundary. Performed as the last step of the rollout so amended charters reference completed reality.
- **Constitution Context Routing update** — replace `Build state | .context-index/build-state/` row with `Lifecycle state | .context-index/lifecycle-state/` in `constitution.md`; sync to `CLAUDE.md` via `/adev:sync`.

### Rev 7 additions (sidecar pattern + per-revision events)

- **Plan-adjacent sidecar pattern** — formalize the `<artifact-stem>.<purpose>.<ext>` peer-file convention per [ADR-0012](../../../adrs/0012-plan-adjacent-sidecar-artifacts.md). Closed enum of four peers: `.review.md` (existing), `.validate.md` (existing), `.routing.json` (new in plan-routing-sidecar rev 2; replaces `/adev:route` plan mutation; machine-primary), `.blockers.md` (new in commit `7e333fd`, `/adev:build` BLOCK path). Extension follows primary consumer: `.md` human-primary, `.json` machine-primary (with `render-sidecar` for the on-demand markdown view). Adding a new peer requires an ADR amendment.
- **`/adev:route` plan-mutation fix** — `skills/route/SKILL.md` Step 4 rewritten to write `<plan-stem>.routing.json` keyed by task ID; the plan file is NEVER mutated. Resolves `issue-526` and the CON-8 violation surfaced by `tests/skills/plan-task-immutability.test.mjs`.
- **`/adev:implement` routing-reader update** — `skills/implement/SKILL.md` reads routing annotations from the sibling `.routing.json` sidecar instead of parsing inline `**Routing:**` blocks from the plan body.
- **Plan-immutability detector enhancement** — `lib/plan-immutability.mjs` extended to catch the "mutate-then-single-add-commit" pattern by inspecting the plan body for inline `**Routing:**` blocks when no sibling `.routing.json` exists. Today's detector relies on `--diff-filter=M` history alone, which masks violations for plans committed as a single add (the cursor-provider Specs A–E pattern).
- **CON-8 enumerated peers** — amend `plan-task-events.spec.md` invariant CON-8 to explicitly enumerate the four permitted sidecar peers with their extensions. Future readers cannot mistake a `<stem>.routing.json` file for a violation of the "plan markdown is read-only" rule.
- **Cursor-provider 5-plan migration** — `lib/migrate-plan-routing.mjs` and `adev migrate plan-routing` CLI subcommand. One-shot: parse each of the 5 cursor-provider plans (`hook-config-generator`, `cursor-adapter`, `plugin-manifest-and-parity`, `cli-install-integration`, `sync-target-output`), extract `**Routing:**` / `**Scores:**` / `**Rationale:**` blocks into sibling `.routing.json` files, rewrite the plan bodies without them, stamp the resulting M-commit hash into `manifest.yaml :: hygiene.plan_immutability.exempt_commits[]` so the enhanced detector treats the migration commit as the canonical "first non-mutating state" baseline. Idempotent.
- **Per-revision lifecycle event schema** — `reviewer_report` and `step_completed` events gain an optional `revision: N` field carrying the spec revision active at write time. Read side: `currentState()` projection exposes per-revision verdicts (e.g. `state.steps.review.byRevision[N]`). Foundation for the cross-charter auto-retry work tracked in `issue-527`; the schema bump itself is owned here because the event log shape lives in `lifecycle-event-log.spec.md` / `lib/lifecycle-state.mjs`.

### Out of Scope

- **Charter capability map** — stays as a markdown table mutated by `/adev:implement`. Acknowledged dual-write risk; low frequency makes it tolerable. Migrated to JSON in a follow-up charter if it becomes a problem.
- **`.review.md`, `.validation.md`, TDD handoff blocks** — stay as markdown. These are wholesale-rewrite artifacts; no agent surgically patches them.
- **Specs, ADRs, research, orientation, sessions, plan-file prose** — stay as markdown. Prose, written once or wholesale.
- **SQLite, TOON, custom binary formats** — explicitly rejected by research; outside the design space.
- **Centralized lifecycle state file** — explicitly rejected; per-spec only. A single file with every spec's data is the failure mode this charter exists to eliminate.
- **Aggregate index file for spec pipeline status** — computed on demand from per-spec files via `listLifecycleStates()`; not stored.
- **Beads adapter retirement** — beads stays as an optional backend. Native JSON becomes the default; `backend: beads` continues to work.
- **`createEpic` / `updateEpic` removal** — these methods remain on the `JsonAdapter` as deprecated wrappers around the unified `create()` / `update()` flow, identical to today's `FileAdapter`. Removal is a follow-up charter, not part of this scope.
- **Markdown `backend: file` removal** — read-only support is preserved for one release cycle (next minor version after this charter lands). Removal of the markdown adapter is a follow-up; specs in this charter define the deprecation window but not the removal commit.
- **External tracker sync** — already out of scope for `task-management`; remains out here.
- **Per-step aggregation rule override (majority / weighted voting)** — strict aggregation suffices for v1. Revisit if domains request it.
- **Lifecycle log compaction** — not needed at current N. Add when individual logs exceed ~10k events.

### Rev 7 — Out of Scope (cross-charter pointers for `issue-527`)

- **`/adev:specify --revise` workflow** — owned by `spec-lifecycle` charter. The auto-retry pathway in `/adev:build` requires a real revision workflow on `/adev:specify` (today the workflow axis is closed at `{extract, refactor, from-diff, cross-cutting}` with no revise mode). When that charter adds the capability, it will consume this charter's per-revision lifecycle event schema as a substrate. Tracked as part of `issue-527`.
- **Canonical blocker IDs (reviewer protocol)** — owned by `spec-lifecycle` charter (or wherever the reviewer registry lives). Reviewer subagents need to emit stable blocker identifiers alongside prose findings so convergence detection across revisions becomes possible. Tracked as part of `issue-527`.
- **Convergence detection in `/adev:build`** — owned by `strategic-planning` charter (`adev-build-skill.spec.md` lives there). Compares blocker ID sets across revisions (addressed / persistent / new partitions) to decide loop continuation. Re-enables `build.max_review_retries` default of 2. Tracked as part of `issue-527`.
- **Additional sidecar peers beyond the four enumerated** — adding a fifth `.<purpose>.md` peer requires an ADR amendment per ADR-0012. Out of scope for this revision.
- **Per-revision spec-file storage** — revisions of the spec markdown itself are not retained on disk by this charter. The lifecycle log carries per-revision review verdicts (rev 7 schema bump); whether to retain prior spec bodies is a separate question owned by `spec-lifecycle`.

### Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| `task-management` | internal module | Owns issue lifecycle semantics; storage format moves here |
| `spec-lifecycle` | internal module | Owns build-state semantics; storage format and rename move here |
| `session-awareness` | internal module | Owns execution-state semantics; format migrates here |
| `milestone-lifecycle` | internal module | Owns milestone semantics; format migrates here |
| `lib/domains/domain-config.mjs` | existing helper | Resolves severity from `reviewers.yaml` / `gates.yaml` at write time |
| `lib/build-state.mjs` (exemplar) | existing helper | Atomic-write pattern that this charter generalizes |
| `lib/issues/registry.mjs` | existing helper | Adapter registry; gains `json` as a supported backend |
| `node:fs` built-in | runtime | `fs.appendFile`, `fs.rename`, `fs.writeFile` — no external deps |
| ADR-0012 | internal ADR | Establishes the plan-adjacent sidecar pattern; rev 7 capabilities implement its three acceptance gates (`/adev:route` fix, CON-8 amendment, detector enhancement) so the ADR can flip from Proposed to Accepted |

## Domain Model

### Entities

- **LifecycleEvent** — a single line in a `<slug>.jsonl` file. Always has `ts` (ISO-8601) and `event` (string discriminator). Other fields vary by variant. Variants: `lifecycle_step`, `step_completed`, `step_failed`, `reviewer_report`, `validator_report`, `plan_task`, `debug_intervention`, `recovery_record`, `manual_override`. Schema is open — new variants are additions, not migrations.

- **LifecycleLog** — append-only sequence of LifecycleEvents for one spec. Persisted at `.context-index/lifecycle-state/<slug>.jsonl`. Lifecycle: created on first write (`ensureLifecycleState`), grows monotonically, never rewritten in place. Compaction is a future concern.

- **StateProjection** — the fold output of a LifecycleLog. Shape: `{spec, status, currentStep, currentTask, steps{}, plan_tasks{}, interventions[], started, updated}`. Recomputed on every read; never persisted as authoritative state.

- **ActorReport** — a `reviewer_report` or `validator_report` event. Carries `step`, actor `name`, `severity` (stamped at write time from domain config), `verdict` (`PASS` / `PASS_WITH_NOTES` / `FAIL`), and optional fields (notes, error, duration, score).

- **IssueBoard** — `.context-index/tasks/tasks.json`. Single document containing `{version, epics[], issues[]}`. Atomic-write target. Entry granularity is human-board level (epics, features, specs, bugs) — never per-plan-task.

- **Issue / Epic** — existing entities from `task-management` charter; same schema fields, new storage shape. JSON adapter implements the unchanged `IssueManagerInterface`.

- **ExecutionState** — `.context-index/.execution-state.json`. Single object with `planRef`, `currentTask`, `status`, `blockers`, `nextAction`, `issueBinding`. Written atomically on transition.

- **MilestoneRegistry** — `.context-index/milestones.json`. List of milestones with name, status, target date, epic link, release config, ship criteria. Same shape as today's YAML.

- **Severity** — enum: `blocker`, `error`, `warning`, `advisory`. Determined per actor from existing domain config (`reviewers.yaml::severity_cap`, `gates.yaml::severity`). Stamped on each ActorReport at write time.

- **Verdict** — enum: `PASS`, `PASS_WITH_NOTES`, `FAIL`. Returned by actors; aggregated by the fold. Rev 7 addition: each `ActorReport` event optionally carries `revision: N` (the spec revision active at write time); the projection surfaces per-revision verdicts via `state.steps.<step>.byRevision[N]` to support cross-revision convergence checks owned by sibling charters.

- **SidecarArtifact** *(rev 7)* — sibling-file peer to a Live Spec or plan at `<artifact-stem>.<purpose>.md`. Closed enum of four variants per ADR-0012: `review` (writer: `/adev:review-specs`), `validate` (writer: `/adev:validate`), `routing` (writer: `/adev:route`, rev 7 introduces), `blockers` (writer: `/adev:build` BLOCK path, in use since commit `7e333fd`). Each sidecar is rewritten in full by its writer; consumers grep-discover by stem. Adding a fifth variant requires an ADR amendment.

- **StepName** — enum: `specify`, `review`, `plan`, `route`, `implement`, `validate`. Extensible via the open event schema if future steps are added.

### Relationships

| From | To | Cardinality | Notes |
|------|----|-------------|-------|
| Spec file | LifecycleLog | 1 : 1 | Slug derived from spec filename |
| LifecycleLog | LifecycleEvent | 1 : N | Append-only |
| LifecycleEvent | ActorReport | inherits | ActorReport is a subtype of LifecycleEvent |
| ActorReport | Severity | N : 1 | Stamped from domain config |
| StateProjection | LifecycleLog | derived | Pure fold; never persisted as truth |
| IssueBoard | Issue | 1 : N | Single board, many issues |
| IssueBoard | Epic | 1 : N | Single board, many epics |
| Epic | Issue | 1 : N | Issue.epicId reference |
| Plan file | plan_task events | 1 : N | Events live inside the spec's LifecycleLog, scoped by `plan` field |
| Milestone | Epic | 1 : 1 | Existing milestone-lifecycle linkage |
| Domain config | Severity | resolves | Fold lookup at write time only; not stored on disk twice |

### Invariants

1. **Append-only.** LifecycleLog files are written exclusively via `appendEvent`. No skill or hook may rewrite an existing line. The lib enforces this — writes go through `fs.appendFile` with newline termination.

2. **Severity is immutable once written.** Once an event lands on disk with a severity, that severity remains. Changing `severity_cap` in domain config affects future events only.

3. **State is derived, never stored.** No file holds the projected `StateProjection`. Every read recomputes from events. Snapshot caches, if ever added, are advisory and reconstructable from the log.

4. **One LifecycleLog per spec, full stop.** All event types for a spec — lifecycle steps, plan tasks, reviewer reports, debug interventions — live in the same file. No sibling state files for the same spec.

5. **Issue board granularity invariant.** No Issue on the board has a `planRef` + `planTask` binding after the migration completes. Plan tasks live exclusively in lifecycle logs as `plan_task` events.

6. **Atomic write or no write.** All JSON writes (`tasks.json`, `execution-state.json`, `milestones.json`) use temp-then-rename. Partial writes are invisible to readers.

7. **Adapter interface stable.** `IssueManagerInterface` (init, create, update, close, list, get, listEpics, createEpic, updateEpic, addDependency, walkTree) is unchanged. JSON adapter, file adapter (deprecated), and beads adapter all conform to it.

8. **Gate enforcement is fold-based.** `/adev:plan` and downstream skills determine prerequisites by reading `currentState(spec).steps[prior]`, not by grepping filesystem artifacts. Hard-block default; manifest knob softens to advisory.

9. **Markdown is rendered, never authoritative.** Any `.md` file produced from JSON/JSONL state carries a "DO NOT EDIT — generated" header and is regeneratable. Editing the rendered file has no effect on the source of truth.

10. **Write-state suffix taxonomy.** Four write-state suffixes are orthogonal to artifact-kind suffixes (`.spec.md`, `.plan.md`, etc. — owned by `spec-file-suffixes.spec.md`). Each suffix has exactly one owner and one purpose; tooling never aliases them.
    - **`.tmp`** — byte-level atomic-rename staging (`fs.writeFileSync(tmpPath); fs.renameSync(tmp, final)`). Lifetime: milliseconds. Never recovered, never persisted across process exit. Exemplars: `lib/build-state.mjs::atomicWriteJson`, `lib/issues/json-adapter.mjs::_write` (random-hex `.tmp` suffix).
    - **`.lock`** — exclusive-write coordination via `openSync(O_EXCL)`. Lifetime: scoped to one critical section. Exemplar: `lib/issues/json-adapter.mjs` (`tasks.json.lock`).
    - **`.partial`** — artifact-level incremental authoring. Lifetime: minutes to hours; persists across process exit so a successor invocation can resume or discard. Committed via atomic rename. Carries a `partial_schema: <skill>@<version>` marker in the first authored chunk. Owned by `incremental-artifact-writes.spec.md`.
    - **`.partial.lock`** — sidecar coordination for `.partial` writers. Holds `{pid, started_at}` so orphan locks can be stolen on stale. Owned by `incremental-artifact-writes.spec.md`.

    Recovery scanners look only at `.partial` (never `.tmp`); lock-coordination logic distinguishes `.partial.lock` from `tasks.json.lock`; etc. Canonical artifact-kind globs (`*.spec.md`, `*.plan.md`, etc.) MUST NOT match `<name>.<kind>.md.partial` — partials are invisible to spec-aggregation tooling by construction (a future regression broadening a glob to `*.md` would violate this invariant).

## Capability Map

| Capability | Description | Priority | Status |
|------------|-------------|----------|--------|
| Lifecycle event log | `lib/lifecycle-state.mjs` with append-only JSONL writes, `appendEvent`/`readEvents`/`currentState`/`requireGate`/`listLifecycleStates`/`renderMarkdown`. Defines canonical event schema and multi-writer fold-aggregation algorithm. Foundation. | must-have | validated |
| JSON issue board + adapter | `.context-index/tasks/tasks.json` document, `lib/issues/json-adapter.mjs` implementing the unchanged `IssueManagerInterface`, registry update (`backend: json`), new-scaffold default. | must-have | validated |
| Severity stamping at write time | `reportReviewer()` / `reportValidator()` helpers that look up severity from `reviewers.yaml`/`gates.yaml` once at write and stamp it on the event. Reads stay config-free. | must-have | validated (lib in `lifecycle-event-log`; adoption in `lifecycle-skill-instruction-updates`) |
| Plan-task events in lifecycle log | `/adev:plan` writes `plan_task` events instead of creating per-task issues. `/adev:implement` reads/writes plan-task events. Plan-file checkboxes no longer mutated. | must-have | validated |
| Issue board granularity cleanup | Enforces post-migration invariant: no issue with `planRef`+`planTask`. Board entries are epic / feature-spec / bug level only. Includes `/adev:plan`, `/adev:specify`, `/adev:work` instruction updates and migration collapse of existing per-task issues. | must-have | validated (write-side invariant in `json-issue-board-adapter`; plan-task event redirection in `plan-task-events`; migration collapse in `one-shot-migration-tool`; skill-instruction updates in `lifecycle-skill-instruction-updates`) |
| Lifecycle-state gates | `requireGate(state, stepName)` replaces filesystem-grep of `.review.md` frontmatter. Hard-block default; `lifecycle.gate_mode: strict\|advisory` knob softens. | must-have | validated (lib in `lifecycle-event-log`; adoption in `lifecycle-skill-instruction-updates`) |
| Execution state migration | `.execution-state.md` → `.execution-state.json`. `lib/execution-state.mjs` rewritten; `hooks/session-start.sh` and `hooks/lifecycle-gate-bash.sh` invoke a Node helper. | must-have | validated |
| Milestones migration | `milestones.yaml` → `milestones.json`. New `lib/milestones.mjs` wrapper. `/adev:issues milestone *` subcommands updated. | must-have | validated |
| Directory rename: build-state → lifecycle-state | One-shot rename in migration tool. Constitution Context Routing table and references updated. | must-have | validated |
| One-shot migration tool | `lib/migrate-state-artifacts.mjs` + `adev migrate` CLI subcommand. Converts tasks.md, build-state, .execution-state.md, milestones.yaml in one pass. Idempotent. Preserves IDs, deps, beads-map. | must-have | validated |
| Lifecycle skill instruction updates | Every lifecycle skill's `SKILL.md` rewritten to call adapter / `lib/lifecycle-state.mjs` APIs instead of describing markdown-table format. | must-have | validated |
| Direct-fs consumer migration | `viz/build.mjs` inline parser replaced with adapter call. Bash hooks switched to Node helper. | must-have | validated (bash hooks switched in `execution-state-migration` + `lifecycle-skill-instruction-updates`; `viz/build.mjs` migrated in commit `fd75162` on branch `feat/agent-reliable-state-artifacts/test-migration`) |
| Provider mirror sync | `providers/codex/skills/*` and `providers/opencode/skills/*` updated to match new lifecycle skill instructions. Synced per-skill as each source-skill PR lands. | must-have | review-passed (skipped per risk policy: low) |
| Test migration | Every test fixture and assertion against markdown-table or YAML format rewritten against JSON/JSONL. Format-evolution tests replaced with schema-version tests. | must-have | validated |
| Sibling charter amendments | Revisions to `task-management`, `spec-lifecycle`, `session-awareness`, `milestone-lifecycle` charters: reference this charter as storage-format authority, update normative paths to `.json`/`.jsonl` where applicable, note ownership boundary. Performed as the last rollout step. | must-have | review-passed (skipped per risk policy: low) |
| Constitution Context Routing update | Replace `Build state` row with `Lifecycle state` in `constitution.md`; sync via `/adev:sync`. Single small edit; bundled with the rename PR. | must-have | validated |
| Markdown rendering layer | `lib/issues/render-markdown.mjs` and `lib/lifecycle-state.mjs::renderMarkdown` produce human-readable markdown from authoritative JSON/JSONL on demand. Surfaced via `adev status --render`. | should-have | validated |
| Spec pipeline aggregate view | `/adev:status` surfaces "where is each spec" by calling `listLifecycleStates()`. Pure read; no stored aggregate. Covered by `markdown-rendering-layer.spec.md` (`adev status --pipeline`). | should-have | validated |
| `listLifecycleStates()` helper | Globs `.context-index/lifecycle-state/*.jsonl` and returns folded projections. Used by aggregate views, `/adev:retro`, `/adev:hygiene`. Signature in `lifecycle-event-log.spec.md`; full body in `markdown-rendering-layer.spec.md`. | should-have | validated |
| Plan-adjacent sidecar pattern *(rev 7)* | Formalize the `<artifact-stem>.<purpose>.md` peer convention per ADR-0012. Closed enum of 4 peers: `review`, `validate`, `routing`, `blockers`. Adding a peer requires an ADR amendment. Acceptance gate for ADR-0012 transition Proposed → Accepted. | must-have | implemented (plan-routing-sidecar.spec.md) |
| `/adev:route` plan-mutation fix *(rev 7)* | `skills/route/SKILL.md` Step 4 rewritten to write `<plan-stem>.routing.json` keyed by task ID instead of mutating the plan body. `skills/implement/SKILL.md` reader updated to load routing from the sidecar. Resolves `issue-526` and the CON-8 violation surfaced by `tests/skills/plan-task-immutability.test.mjs`. | must-have | implemented (plan-routing-sidecar.spec.md rev 2) |
| CON-8 enumerated peers *(rev 7)* | Amend `plan-task-events.spec.md` invariant CON-8 to explicitly enumerate the four permitted sidecar peers with their extensions. Future readers cannot mistake a `<stem>.routing.json` file for a violation of the "plan markdown is read-only" rule. | must-have | implemented (plan-routing-sidecar.spec.md rev 2) |
| Plan-immutability detector enhancement *(rev 7)* | `lib/plan-immutability.mjs` extended to catch the "mutate-then-single-add-commit" pattern by inspecting plan body for inline `**Routing:**` blocks when no sibling `.routing.json` exists. Today's detector relies on `--diff-filter=M` history alone, which masks violations introduced before the plan is first committed (the cursor-provider Specs A–E case). | must-have | implemented (plan-routing-sidecar.spec.md rev 2) |
| Cursor-provider 5-plan migration *(rev 7)* | `lib/migrate-plan-routing.mjs` + `adev migrate plan-routing` CLI subcommand. One-shot: extracts inline `**Routing:**` / `**Scores:**` / `**Rationale:**` blocks from the 5 cursor-provider plans (`hook-config-generator`, `cursor-adapter`, `plugin-manifest-and-parity`, `cli-install-integration`, `sync-target-output`) into sibling `.routing.json` files, rewrites plan bodies without them, stamps the resulting M-commit in `manifest.yaml :: hygiene.plan_immutability.exempt_commits[]`. Idempotent. | must-have | — |
| Per-revision lifecycle event schema *(rev 7)* | `reviewer_report` and `step_completed` events gain an optional `revision: N` field carrying the spec revision active at write time. `currentState()` projection exposes per-revision verdicts via `state.steps.<step>.byRevision[N]`. Foundation for the cross-charter auto-retry work in `issue-527` (the rest of which is owned by `spec-lifecycle` and `strategic-planning`). | must-have | implemented (review-block-auto-retry.spec.md — cross-cutting) |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|------------------|------------|
| Charter capability map → JSON sidecar | Status changes infrequently; dual-write risk low. Defer until pattern is proven on lifecycle state. | TBD | This charter complete |
| Lifecycle log compaction | Not needed at current N. Add when individual logs exceed ~10k events. | TBD | This charter complete + observed scale |
| Per-step aggregation rule override (majority / weighted) | Strict default suffices for v1. Revisit if domains request it. | TBD | This charter complete + user feedback |
| Snapshot cache (`<slug>.snapshot.json`) | Premature optimization at current fold cost. | TBD | Performance evidence |
| `/adev:status` board drill-down with per-spec lifecycle inline | Cosmetic. Plain status output suffices for v1. | TBD | This charter complete |
| External tracker sync from JSON board | Out of scope for `task-management`; remains out here. | — | — |

## Interface Contracts

### `lib/lifecycle-state.mjs` — exported API

```javascript
// Primitive write — append one event line
appendEvent(projectRoot, specPath, event) → void

// Primitive read — return array of events
readEvents(projectRoot, specPath) → LifecycleEvent[]

// Convenience writers — resolve severity from domain config, stamp on event, append
reportReviewer(projectRoot, specPath, { step, reviewer, verdict, notes? }) → void
reportValidator(projectRoot, specPath, { step, validator, verdict, error?, score?, duration_ms? }) → void
reportStep(projectRoot, specPath, { step, status, verdict? }) → void
reportPlanTask(projectRoot, specPath, { plan, task_id, status, notes? }) → void
reportIntervention(projectRoot, specPath, { kind, note }) → void

// Bootstrap / lifecycle helpers
ensureLifecycleState(projectRoot, specPath) → void
hasLifecycleState(projectRoot, specPath) → boolean

// Projection
currentState(projectRoot, specPath) → StateProjection
filterEvents(projectRoot, specPath, predicate) → LifecycleEvent[]

// Gate
requireGate(state, stepName) → void
//   manifest knob: lifecycle.gate_mode = "strict" (default) | "advisory"

// Aggregate
listLifecycleStates(projectRoot) → { spec, slug, status, currentStep, updated }[]
slugFromSpec(specPath) → string

// Rendering
renderMarkdown(state) → string
```

### Event schema (canonical line shapes)

All events carry `ts` (ISO-8601) and `event` (string discriminator). Variants:

```jsonl
{"ts":"...","event":"lifecycle_step","step":"specify","status":"started","invoked_via":"build|standalone","actor":"agent/claude-code"}
{"ts":"...","event":"reviewer_report","step":"review","reviewer":"structural-architect","severity":"blocker","verdict":"PASS","notes":null}
{"ts":"...","event":"validator_report","step":"validate","validator":"test-suite","severity":"error","verdict":"PASS","duration_ms":2400}
{"ts":"...","event":"step_completed","step":"review","verdict":"PASS_WITH_NOTES","aggregated_from":["structural-architect","security-reviewer","consistency-analyzer"]}
{"ts":"...","event":"step_failed","step":"validate","verdict":"FAIL","aggregated_from":[...],"failing":["schema-conformance"]}
{"ts":"...","event":"plan_task","plan":".context-index/specs/.../foo.plan.md","task_id":"t2","status":"in_progress","notes":null}
{"ts":"...","event":"debug_intervention","note":"ran adev:debug after task 1 GREEN; restarted at task 2","by":"agent/claude-code"}
{"ts":"...","event":"recovery_record","ref":".context-index/.recovery/<slug>-<ts>.json"}
{"ts":"...","event":"manual_override","field":"steps.review.verdict","from":"FAIL","to":"PASS","reason":"...","by":"user/<name>"}
```

Open schema: domains and future skills may define new event variants. Unknown `event` values are preserved on read and ignored by core projections.

### `lib/issues/json-adapter.mjs` — implements `IssueManagerInterface` (unchanged)

```javascript
class JsonAdapter {
  constructor(projectRoot, opts) {}
  async init()
  async create(issueData)
  async update(id, changes)
  async close(id, reason)
  async list(filters)
  async get(id)
  async listEpics(filters)
  async createEpic(epicData)       // legacy, deprecated
  async updateEpic(id, changes)    // legacy, deprecated
  async addDependency(issueId, dependsOnId)
  async walkTree(parentId)
}
```

### `tasks.json` document schema

```json
{
  "version": 2,
  "epics": [
    { "id": "epic-1", "title": "...", "status": "open", "milestone": null, "plan_ref": null, "created": "...", "updated": "..." }
  ],
  "issues": [
    { "id": "issue-1", "title": "...", "status": "open", "priority": 1, "type": "task",
      "epicId": "epic-3", "spec_ref": ".context-index/specs/.../foo.spec.md",
      "deps": [], "notes": null, "next_action": null, "created": "...", "updated": "..." }
  ]
}
```

Post-migration invariant: no `planRef` or `planTask` field on issues. Plan tasks live as events in the lifecycle log.

### `.execution-state.json` document schema

```json
{
  "status": "active",
  "planRef": ".context-index/specs/.../foo.plan.md",
  "currentTask": "t2",
  "issueBinding": "issue-42",
  "blockers": null,
  "nextAction": "Run /adev:implement task t2",
  "updated": "..."
}
```

### `milestones.json` document schema

Mirrors today's `milestones.yaml` shape exactly; only the format changes. Existing field names preserved for compatibility with `milestone-lifecycle` charter.

### CLI surface (additions)

```bash
adev migrate                       # one-shot conversion of all state artifacts
adev migrate --dry-run             # preview changes
adev migrate --artifact=tasks      # scope to a single artifact

adev status --render               # write tasks.md and lifecycle render from JSON
adev status --pipeline             # show spec pipeline aggregate via listLifecycleStates()
```

### Manifest additions (`manifest.yaml`)

```yaml
tasks:
  backend: json                    # new default; "file" (markdown) and "beads" still supported

lifecycle:
  gate_mode: strict                # strict (default) | advisory
```

### Hook contracts

Shell scripts (`session-start.sh`, `lifecycle-gate-bash.sh`) remain the **registered hook entry points** in `hooks/hooks.json` and retain exclusive ownership of exit codes (0 = allow, 2 = block). The Node helper invoked by these scripts is a parsing subprocess only — it returns parsed data on stdout for the shell script to act on, but it does not own the hook protocol. This preserves constitution Non-Negotiable Principle 4 (hook protocol compliance).

- `hooks/session-start.sh` — calls a Node helper for parsing; no inline YAML. Shell script remains the registered entry point and owns exit code.
- `hooks/lifecycle-gate-bash.sh` — same Node-helper pattern; no inline grep. Shell script remains the registered entry point.
- `hooks/issue-reminder.mjs` — already uses `lib/issues/registry.mjs`; behavior unchanged.

### Consumed APIs

| API | Consumer | Producer |
|---|---|---|
| `IssueManagerInterface` | every lifecycle skill, `viz/build.mjs`, `hooks/issue-reminder.mjs` | `lib/issues/json-adapter.mjs` (this charter) |
| `lib/lifecycle-state.mjs` | every lifecycle skill | this charter |
| `loadDomainConfig(domain, 'reviewers', ...)` | `reportReviewer()` | existing `lib/domains/domain-config.mjs` |
| `loadDomainConfig(domain, 'gates', ...)` | `reportValidator()` | existing `lib/domains/domain-config.mjs` |
| `getIssueManager(manifest)` | every lifecycle skill | existing `lib/issues/registry.mjs` (extended) |

### Backward compatibility surface

- `backend: file` (markdown) — supported as **read-only** for one release cycle. New writes go through JSON.
- `backend: beads` — unchanged; continues to delegate to `br` CLI.
- Old `build-state/<slug>.json` files — read by migration tool only; not used post-migration.

## Quality Attributes

| Attribute | Target | Measurement |
|-----------|--------|-------------|
| `appendEvent` write latency | < 5 ms p99 | `tests/lib/lifecycle-state.test.mjs` perf assertion |
| `currentState()` read+fold latency | < 5 ms p99 for N=50 events; < 50 ms p99 for N=1000 | Parameterized event-count perf test |
| `listLifecycleStates()` aggregate latency | < 100 ms p99 for 100 specs (cold cache) | Synthetic fixture; CI gate |
| Crash safety | Partial writes invisible to readers; final-line truncation tolerated (skip-and-continue) | Fault-injection: kill process mid-write, assert reader sees prior consistent state |
| Concurrent-write safety | Two `appendEvent` calls from different processes never interleave on the same file (assumes payloads ≤ PIPE_BUF ~4 KB on macOS/Linux; not a POSIX guarantee but reliable on target platforms) | 100 concurrent appenders test; assert all events present and well-formed |
| Migration idempotency | Running `adev migrate` twice produces identical output to once | Round-trip diff = empty on second run |
| Migration completeness | All existing tasks.md / build-state.json / .execution-state.md / milestones.yaml data appears in JSON output | Field-by-field round-trip compare against old-format parse |
| Schema evolution cost | Adding a new event variant requires zero changes outside the producing skill | Architectural test: `lib/lifecycle-state.mjs` has no hard-coded variant list in read paths |
| Format invariant: append-only | No code path rewrites a `<slug>.jsonl` file | Architectural test: grep `lifecycle-state` for non-`appendFile` writes; CI gate |
| Format invariant: severity stamped at write | No `reviewer_report` or `validator_report` event lacks a `severity` field | Schema-validation test over fixture events |
| Issue board granularity invariant | After migration, no issue has both `planRef` and `planTask` set | `tests/lib/issues-board-cleanup.test.mjs` on migrated fixture |
| Test coverage (new lib code) | ≥ 90% line coverage on `lib/lifecycle-state.mjs`, `lib/issues/json-adapter.mjs`, `lib/migrate-state-artifacts.mjs` | `npm test --coverage` |
| Skill-instruction freshness | Every lifecycle skill SKILL.md references the new APIs; no leftover `tasks.md` row format or YAML frontmatter parsing instructions | `tests/skills/no-stale-format-refs.test.mjs` |
| Provider mirror parity | Codex and opencode mirrors carry identical API references to the source skills | `tests/providers/mirror-parity.test.mjs` |
