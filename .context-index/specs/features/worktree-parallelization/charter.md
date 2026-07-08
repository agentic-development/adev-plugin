---
status: approved
kind: feature
revision: 2
updated: 2026-07-07
---

# Feature Charter: Worktree Parallelization

## Business Intent

adev runs file-mutating lifecycle work — implementing plan task-groups, building the specs of a
milestone — strictly serially, because parallel subagents editing the same working tree collide.
The Claude Code harness's `isolation: "worktree"` cannot fix this for a lifecycle orchestrator: it
nests infinitely when dispatched from inside a worktree, breaks its own auto-cleanup when a subagent
commits, and does not compose with adev's serial task model. This module owns an **adev-managed git
worktree primitive** and the **parallel-execution orchestration** that consumes it, so independent,
file-disjoint work runs concurrently — cutting milestone and multi-group wall-clock without changing
the result.

## Scope and Boundaries

### In Scope

- adev-managed git worktree lifecycle — create, list, merge-back, remove, and a nesting guard —
  anchored to the **main** repo root so worktrees never nest, with slug validation and
  conflict-aware merge.
- The `adev worktree` CLI verb surface (JSON output, deterministic exit codes).
- The `/adev:implement --parallel` consumer: read the plan's existing `## Parallelization` groups and
  run file-disjoint groups concurrently, each in its own worktree, then merge back.
- Parallel `/adev:build --milestone` for dependency-independent specs.
- Merge-back orchestration and partial-failure semantics (retain the failed worktree for inspection,
  merge the successful ones, never leave the shared board half-updated).
- Serial fallback: detect that the current directory is already inside a worktree and degrade to
  serial execution with a stated reason.

### Out of Scope

- Non-git version control systems.
- Cross-repo, submodule, or workspace-level worktrees.
- Rewriting or replacing the harness's Agent-tool `isolation` mechanism.
- The parallelization-group *detection* algorithm (owned by `/adev:plan`; this module only consumes
  the groups it emits).
- Read-only parallel fan-out (`/adev:review-specs`, `/adev:research`) — already parallel, needs no
  worktree isolation.
- The serial task loop, TDD enforcement, and 2-stage per-task review inside `/adev:implement` and
  `/adev:build` (owned by the `implementation` and `build` charters). This module owns **only** the
  parallel-execution orchestration invoked behind the `--parallel` / `--milestone` flags; the work
  performed *inside* each worktree remains governed by those charters.
- Syncing the `--parallel` flag documentation from canonical `skills/implement/SKILL.md` to provider
  mirrors under `providers/*/skills/**` (owned by the provider-sync surface).

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `lib/issues` (resolve-root, CAS-locked JsonAdapter) | internal module | Shared issue board resolved to the main root; already safe for concurrent writers |
| `lib/milestones` | internal module | Main-root-resolved shared milestone state |
| `lib/lifecycle-state` / `build-state` / `execution-state` | internal module | Per-worktree workflow state (no cross-branch pollution) |
| `/adev:plan` | internal module | Emits the `## Parallelization` file-disjoint groups consumed here |
| git (>= 2.5, worktree support) | external service | The underlying `git worktree` + `rev-parse --git-common-dir` mechanism |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Worktree | An adev-managed linked working tree for one unit of parallel work | `slug`, `path` (`<mainRoot>/.adev/worktrees/<slug>`), `branch` (`adev/<slug>`), `head` |
| ParallelizationGroup | A file-disjoint set of plan tasks (or specs) eligible to run concurrently | `groupId`, `members` (task ids / spec refs), `fileSet` |
| MergeResult | The outcome of merging a worktree branch back into the orchestrator branch | `slug`, `merged` (bool), `conflicts[]` |
| NestingStatus | Whether a working directory sits inside a worktree | `nested` (bool), `kind` (`harness` \| `adev` \| null) |

### Relationships

- A `ParallelizationGroup` maps 1:1 to a `Worktree` for the duration of a parallel run.
- A `Worktree` resolves its anchor via the main repo root (`git rev-parse --git-common-dir`),
  independent of the invoking working directory.
- A `MergeResult` is produced per `Worktree` at merge-back and drives cleanup/retain decisions.

### Invariants

- A worktree path is always under `<mainRoot>/.adev/worktrees/` and never nests inside another
  worktree, regardless of the cwd it was created from.
- Only file-disjoint groups run in parallel; groups that share files serialize.
- Parallel execution is **result-equivalent** to serial: the same tests pass and the public surface
  is identical. Wall-clock may differ; the result may not.
- The shared issue board reflects every concurrent mutation (CAS retry on `STALE_BOARD_WRITE`); no
  lost updates.
- A failed group's worktree is retained for inspection; successful groups still merge; the board is
  never left half-updated.
- The `.adev/worktrees/` directory and the `adev/<slug>` branch namespace are reserved for adev and
  git-ignored; cleanup guarantees (Reliability) are asserted against that known path/branch prefix.
- Parallel groups execute as **bare, directed subagents** — each dispatched (not with the harness's
  `isolation:"worktree"`) and instructed to do all edits, tests, and commits inside its assigned
  worktree on branch `adev/<slug>`. The orchestrator joins all subagents before any merge-back, and
  verifies each group's commits landed on `adev/<slug>` before merging.

> **Deferred to spec time (`parallel-implement` Live Spec):** the mechanism by which a dispatched
> subagent's working directory is bound to its worktree — *prompt-directed* (dispatch prompt names
> the path; a post-join check confirms commits landed) versus *tool-level* (an Agent-dispatch `cwd`
> or "use existing worktree" option, if one exists). This is a HOW decision; the charter fixes only
> the WHAT (bare directed subagents, per-worktree commits, join-before-merge).

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| worktree-primitive | adev-managed worktree add/list/merge/remove/guard — main-root-anchored, slug-safe, conflict-aborting | must-have | v1 | — |
| worktree-cli-verb | `adev worktree` CLI surface: JSON stdout, exit codes 0/1 | must-have | v1 | — |
| parallel-implement | `/adev:implement --parallel` consumes plan `## Parallelization` groups; runs disjoint groups in worktrees; merges back | must-have | v1 | — |
| merge-back-semantics | conflict detection/abort, merge ordering, partial-failure isolation (retain failed, merge successes) | must-have | v1 | — |
| serial-fallback | detect nesting; degrade to serial with a stated reason | must-have | v1 | — |
| equivalence-eval | A/B serial-vs-parallel eval (adev 4-layer harness) proving result equivalence is the ship gate | should-have | v1 | — |
| parallel-build-milestone | `/adev:build --milestone` builds dependency-independent specs in parallel worktrees | should-have | v2 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| parallel-build-milestone | Higher blast-radius (spec-level merges on shared `.context-index/`); land implement --parallel first | v2 | parallel-implement |
| worktree-status-view | Live status of active adev worktrees for operator visibility | v2 | worktree-primitive |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev worktree <add\|list\|merge\|remove\|guard>` | CLI verb | Manage adev worktrees; JSON on stdout, exit 0 success / 1 error |
| `lib/worktree.mjs` — `add` / `list` / `merge` / `remove` / `detectNesting` / `resolveMainRoot` | functions | Programmatic worktree lifecycle for orchestrator skills |
| `/adev:implement --parallel` | skill flag | Opt into parallel group execution |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `resolveStorageRoot` / `getIssueManager` | `lib/issues` | Shared, CAS-locked board across worktrees |
| `listLifecycleStates` / `reportPlanTask` | `lib/lifecycle-state` | Per-worktree lifecycle events |
| plan `## Parallelization` groups | `/adev:plan` | The file-disjoint group source |
| `git worktree` / `rev-parse --git-common-dir` | git | The underlying worktree + main-root-anchor mechanism |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Correctness (equivalence) | Merged parallel result is behaviorally identical to the serial baseline (same tests pass, empty or formatting-only impl diff). **Prime ship gate.** |
| Performance | Wall-clock of a parallel run is less than serial for ≥2 disjoint groups; per-worktree add/merge/remove overhead bounded (token overhead ≤ 1.15× serial per the A/B eval). |
| Reliability | No orphaned worktrees, dangling `adev/*` branches, or stale `tasks.json.lock` after a run; partial failures isolated and reported. |
| Safety | Worktrees never nest (main-root anchoring); slugs validated against path traversal; merge conflicts abort cleanly, leaving a clean tree. |
| Zero-dependency | Node built-ins + `git` only; no new npm dependencies (Constitution Principle 1). |
| Observability | Each parallel group's lifecycle events remain per-worktree and auditable; conflict reports name the exact files. |
