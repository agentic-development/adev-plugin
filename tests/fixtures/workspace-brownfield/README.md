# Workspace Brownfield — Test Fixture

A realistic "before adev" state: a team already has multiple repos with real code, but no adev context and no workspace configuration. This is the starting point for adopting adev in an existing multi-repo codebase.

## Structure

```
workspace-brownfield/
└── repos/
    ├── dbt-models/           # Existing repo, no .context-index/
    │   └── models/
    │       └── customer_ltv.sql
    ├── data-api/             # Existing repo, no .context-index/
    │   └── src/
    │       └── routes/ltv.js
    └── airflow-dags/         # Existing repo, no .context-index/
        └── dags/
            └── customer_ltv_dag.py
```

## What's in it

- **3 repos with real code** — SQL, JS, Python stubs representing a typical data platform
- **No adev context anywhere** — no `.context-index/` directories, no manifests, no specs
- **No workspace config** — no `adev-workspace.yaml` at the root

## What's NOT in it

- No `.context-index/` in any repo
- No `adev-workspace.yaml` at the root
- No `CLAUDE.md`, no charters, no specs

## Testable Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| `detectWorkspace(root)` | Returns `null` (no workspace file exists) |
| `detectWorkspace(repo subdir)` | Returns `null` (walk-up finds nothing) |
| `/adev:init` in a single repo | Scaffolds that repo's `.context-index/` normally |
| `/adev:init --workspace` at root | Scaffolds `adev-workspace.yaml` — auto-discovery finds **zero** repos (none have adev context yet) |

## Migration Path

Starting from this fixture, a team adopting adev + workspaces would:

1. **Initialize individual repos first.** Run `/adev:init` in each repo to set up their `.context-index/`:
   ```
   cd repos/dbt-models && /adev:init
   cd ../data-api && /adev:init
   cd ../airflow-dags && /adev:init
   ```

2. **Initialize the workspace.** Return to the root and run `/adev:init --workspace`. Auto-discovery now finds all 3 repos (they have `.context-index/manifest.yaml`) and offers to register them.

3. **Declare dependencies** in `adev-workspace.yaml`.

4. **Start writing workspace-level charters** with `/adev:brainstorm` at the workspace root.

## Why This Fixture Matters

This represents the most common real-world starting point for workspace adoption: a team with an existing codebase — not a greenfield project. Tests using this fixture verify that:

- adev gracefully coexists with repos that don't yet have context
- Workspace detection correctly returns `null` when no workspace exists
- No accidental workspace behavior kicks in before the user opts in
- The migration path from "existing repos" → "workspace" is clean

## Notes

- Source files are minimal stubs (same as `workspace-example`) — this fixture is about structure, not code analysis.
- No `.git/` directories — this is a filesystem fixture.
