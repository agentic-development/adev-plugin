---
status: approved
revision: 4
updated: 2026-04-16
---

# Feature Charter: Multi-Repo Workspace

## Business Intent

The adev plugin assumes a single git repository per project. Teams working across multiple repositories that share a domain (e.g., a data platform spanning dbt, Airflow, API, and infrastructure repos) cannot coordinate specs, governance, or agent context across repo boundaries. Multi-Repo Workspace introduces a lightweight coordination layer — an `adev-workspace.yaml` file at the workspace root — that groups multiple repos under shared context, enabling workspace-level charters, cross-repo spec references with validated dependencies, and dependency-aware planning across repos.

## Scope and Boundaries

### In Scope

- Workspace detection — walk up from `cwd` to find `adev-workspace.yaml`
- `adev-workspace.yaml` schema — repo registry, roles, inter-repo dependencies
- `/adev:init --workspace` — scaffold workspace structure and register repos
- Context resolution — skills can read sibling repo `.context-index/` as read-only references
- Workspace-level charters — feature charters that live in the workspace's `.context-index/`
- Repo-level spec decomposition — workspace charters decompose into per-repo specs with `depends-on` cross-references
- Validated cross-repo references — `/adev:review-specs` and `/adev:plan` verify referenced specs exist in sibling repos and are in compatible status
- Dependency-aware planning — `/adev:plan` orders repo-level plans by the workspace dependency graph
- `lib/workspace.mjs` — workspace detection, resolution, manifest parsing

### Out of Scope

- Cross-repo implementation orchestration — agent does not auto-switch repos during `/adev:implement` (Phase 2)
- Workspace-level constitution — repos keep their own constitutions, no workspace override
- Workspace-level CLAUDE.md or agent files — no sync across repos
- Shared issue tracking / beads DB across repos (Phase 2)
- Git submodule/subtree management — users own their git topology
- Build system features (task caching, affected analysis)
- Cross-repo `/adev:validate` (validating interface compatibility across repos — Phase 2)

### Dependencies

| Dependency | Direction | Description |
|-----------|-----------|-------------|
| setup | modifies | `/adev:init` gains `--workspace` flag |
| cli | modifies | CLI detects workspace mode during project state resolution |
| design | modifies | `/adev:brainstorm` gains workspace context for cross-repo charters and for workspace-root `product.md` bootstrap (synthesises from per-repo constitutions); `/adev:specify` gains workspace context for cross-repo specs |
| assessment | modifies | `/adev:review-specs` validates cross-repo `depends-on` references |
| planning | modifies | `/adev:plan` reads workspace dependency graph for ordering (via `--phase`); `/adev:plan --release` / `--milestone` invoked at the workspace root read workspace charters and write milestones to workspace `product.md` |
| strategic-planning | modifies | `/adev:status` aggregates across repos in workspace mode |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Workspace | A directory containing `adev-workspace.yaml` that groups multiple repos | `name`, `repos[]`, `dependencies[]` |
| WorkspaceRepo | A registered repo within a workspace | `slug`, `path` (relative to workspace root), `role` (free-form label) |
| RepoDependency | A directed relationship between two repos | `from` (slug), `to` (slug), `type` (free-form: orchestrates, consumes, deploys, etc.) |
| CrossRepoRef | A reference from a spec in one repo to a spec in another | `@<repo-slug>/<spec-slug>`, resolved via workspace repo registry |
| WorkspaceContext | The assembled read-only view of sibling repos' `.context-index/` | `currentRepo`, `siblingRepos[]`, `dependencyGraph` |

### Relationships

- A Workspace contains one or more WorkspaceRepos
- WorkspaceRepos are connected by RepoDependencies (directed graph)
- A Live Spec may contain CrossRepoRefs in its `depends-on` frontmatter field
- WorkspaceContext is assembled at skill invocation time, not persisted

### Invariants

- Repo slugs within a workspace are unique
- Repo paths resolve to existing directories
- RepoDependency `from` and `to` reference valid repo slugs
- CrossRepoRefs reference repos that exist in the workspace registry
- Sibling repo `.context-index/` is read-only — skills never write to another repo's context
- Single-repo projects (no `adev-workspace.yaml` found) behave identically to current behavior — zero code path changes

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Workspace Detection | Walk up from `cwd` to find `adev-workspace.yaml`. Return workspace root path, parsed config, and current repo slug. No-op when absent. | must-have | 1 | validated |
| Workspace Schema | Define and validate `adev-workspace.yaml` structure: repo registry, dependencies, workspace metadata | must-have | 1 | validated |
| Init Workspace | `/adev:init --workspace` scaffolds `adev-workspace.yaml` and workspace `.context-index/`, optionally auto-discovers repos in child directories | must-have | 1 | validated |
| Context Resolution | Assemble WorkspaceContext at skill invocation — current repo context + read-only sibling repo contexts. Skills opt in via a resolver function. | must-have | 1 | validated |
| Cross-Repo Spec References | Specs declare `depends-on: ["@repo-slug/spec-slug"]` in frontmatter. References resolve to actual spec files in sibling repos. | must-have | 1 | validated |
| Reference Validation | `/adev:review-specs` verifies cross-repo `depends-on` targets exist and are in compatible status (not `draft`) | must-have | 1 | validated |
| Dependency-Aware Planning | `/adev:plan --phase` reads the workspace dependency graph to order repo-level plans (upstream repos first) | should-have | 1 | validated |
| Workspace-Level Charters | `/adev:brainstorm` in the workspace root creates charters in workspace `.context-index/` that decompose into repo-level specs | should-have | 1 | validated |
| Workspace Status | `/adev:status` in workspace root aggregates spec/charter status across all repos | nice-to-have | 1 | validated |
| Workspace-Aware Product Bootstrap | At the workspace root, `/adev:brainstorm` Step 5b bootstraps `product.md` by synthesising identity from `workspace.name` and the registered repos' constitutions (where present). No workspace-level constitution or `manifest.yaml` is required. Subsequent workspace-level brainstorms append/update the Module Map with workspace-charter rows only (each repo retains its own `product.md` Module Map). | must-have | 2 | validated |
| Workspace-Aware Release & Milestone Planning | At the workspace root, `/adev:plan --release` and `/adev:plan --milestone` read workspace charters (workspace + per-repo via `resolveWorkspaceContext`) and write milestones to workspace `.context-index/specs/product.md`. Repo-level specs may reference workspace milestones. Issue-board epic sync is **unconditionally deferred** to the Phase 2 Shared Issue Tracking capability — the workspace has no `manifest.yaml` per the Simplicity quality attribute. | must-have | 2 | validated |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Cross-Repo Implementation Orchestration | Requires solving cwd switching and multi-repo execution state | 2 | Context Resolution |
| Shared Issue Tracking | Requires workspace-level beads DB or cross-repo linking | 2 | Workspace Schema |
| Cross-Repo Validation | Requires interface compatibility checking across repos | 2 | Reference Validation |
| Workspace-Level Governance | Shared boundary rules and transition gates across repos | 2 | Context Resolution |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `lib/workspace.mjs:detectWorkspace(startPath)` | function | Walks up from `startPath` looking for `adev-workspace.yaml`. Returns `{ root, config, currentRepoSlug }` or `null` if not found. |
| `lib/workspace.mjs:resolveWorkspaceContext(workspaceRoot, currentRepoSlug)` | function | Assembles a read-only WorkspaceContext: current repo context, sibling repo `.context-index/` paths, parsed dependency graph. |
| `lib/workspace.mjs:resolveRef(workspaceRoot, crossRepoRef)` | function | Resolves `@repo-slug/spec-slug` to an absolute file path. Returns `null` if repo or spec not found. |
| `adev-workspace.yaml` | config | Workspace manifest consumed by skills and CLI. Declares repos, dependencies, workspace metadata. |
| `--workspace` flag on `/adev:init` | CLI arg | Scaffolds workspace structure. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `.context-index/manifest.yaml` | setup | Read per-repo manifests to discover modules and config |
| `/adev:review-specs` | assessment | Extended to validate `depends-on` cross-repo references |
| `/adev:plan` | planning | Extended to read workspace dependency graph for ordering |
| `/adev:brainstorm` | design | Extended to support workspace-level charters |
| `/adev:status` | strategic-planning | Extended to aggregate across repos |
| `/adev:init` | setup | Extended with `--workspace` scaffolding |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Backward Compatibility | Single-repo projects must work identically — `detectWorkspace()` returning `null` means zero behavior change in any skill. No new files, no new config, no warnings. |
| Performance | Workspace detection adds one filesystem walk-up per skill invocation. Context resolution reads sibling `.context-index/` directories lazily (on first access, not upfront). A workspace with 10 repos should not noticeably slow skill startup. |
| Isolation | Skills never write to sibling repo `.context-index/`. Cross-repo context is strictly read-only. A broken or missing sibling repo degrades gracefully (warning, not error). |
| Simplicity | `adev-workspace.yaml` is the only new config file. No workspace-level constitution, no workspace CLAUDE.md, no workspace manifest.yaml. The workspace is a coordination layer, not an authority layer. |
| Git Agnosticism | The workspace may or may not be a git repo. Constituent repos may use any git topology (separate repos, monorepo subdirs, submodules). The plugin does not manage or assume git structure. |
