# ADR 0005: Workspace-Mode Isolation Invariant

## Status

Accepted

## Date

2026-04-17

## Context

The Multi-Repo Workspace feature (see `specs/features/multi-repo-workspace/charter.md`) introduces a coordination layer that groups multiple repositories under a shared `adev-workspace.yaml`. Skills operating in workspace mode gain read access to sibling repositories' `.context-index/` directories for cross-repo spec references, dependency-aware planning, and workspace-level charters.

This creates a risk: a skill running in repo A could inadvertently write files into repo B's `.context-index/`, causing context contamination, unexpected diffs, and ownership ambiguity. Without a clear invariant, each skill would need ad-hoc write guards, and the correctness of workspace mode would depend on every skill author independently getting it right.

An explicit isolation invariant makes the boundary enforceable at the library level rather than relying on per-skill discipline.

## Decision

Skills operating in workspace mode never write to any registered repository's `.context-index/` directory other than the current working repo or the workspace root. All workspace-mode coordination output (charters, cross-repo plans, aggregated status) goes to the workspace `.context-index/` only. Sibling repository context is strictly read-only.

The following rules enforce this invariant:

1. **Detection** — Skills detect workspace mode via `detectWorkspace(cwd)` from `lib/workspace.mjs`. When it returns `null`, behavior is identical to single-repo mode with zero code path changes.
2. **Write containment** — Workspace-mode skills write only to the workspace `.context-index/` (for workspace-level artifacts) or the current repo's own `.context-index/` (for repo-level artifacts). Never to a sibling repo.
3. **Read-only sibling access** — Sibling repo `.context-index/` is accessed via `resolveWorkspaceContext()` for reference only (spec status, dependency graph, constitution). No mutations.
4. **Path enforcement** — `assertPathInWorkspace()` in `lib/workspace.mjs` validates that any write target is within the permitted scope before the write occurs. Skills that write files must call this guard.
5. **Violation classification** — Any skill writing to a sibling repo's `.context-index/` is a bug, not a feature gap. The correct fix is always to write to the workspace `.context-index/` or to instruct the user to run the appropriate skill inside the target repo.

## Alternatives Considered

1. **Shared workspace `.context-index/` that merges with repo context** — A single workspace-level context directory that transparently overlays with each repo's context during resolution. Rejected because merge semantics are complex (which file wins?), conflict resolution is undefined, and it violates the single-owner principle for context artifacts.

2. **Skills write to the target repo's `.context-index/` during cross-repo planning** — When `/adev:plan` decomposes a workspace charter into repo-level specs, it would write those specs directly into each repo. Rejected because it violates the single-owner principle: repo A's agent should not create specs inside repo B. The correct workflow is to plan at the workspace level and then run `/adev:specify` inside each target repo.

3. **No formal invariant — trust skills to do the right thing** — Rely on code review and convention to prevent cross-repo writes. Rejected because implicit conventions are too fragile for a plugin consumed by automated agents. An enforceable guard (`assertPathInWorkspace`) is strictly better than a convention.

## Consequences

- **Clear ownership boundaries** — each repo's `.context-index/` has exactly one owner (the repo itself), making it safe for concurrent agent sessions across repos in the same workspace.
- **Safe concurrent use** — multiple agents can operate in different repos of the same workspace without risk of write conflicts in sibling context directories.
- **No cross-repo contamination** — a misbehaving skill in repo A cannot corrupt repo B's specs, charters, or task board.
- **Workspace-level plans cannot auto-scaffold repo-level specs** — this is a deliberate trade-off. A workspace charter decomposition produces cross-repo references and ordering, but the actual repo-level specs must be authored by running `/adev:specify` inside each target repo. This adds a manual step but preserves isolation.
- **Graceful degradation** — a broken or missing sibling repo produces a warning, not an error. Skills continue with reduced context rather than failing.
