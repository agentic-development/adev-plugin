# Workspace Blank — Test Fixture

A minimal workspace fixture showing the "day 0" state after running `/adev:init --workspace` on a fresh directory, before any repos are registered or specs are written.

## Structure

```
workspace-blank/
├── adev-workspace.yaml       # Scaffolded workspace config — no repos yet
└── .context-index/           # Empty workspace-level context directory
```

## What's in it

**`adev-workspace.yaml`** — scaffolded from `templates/workspace-template.yaml`:
- `workspace.name` is set to the workspace directory name
- `repos: []` — no repos registered
- `dependencies: []` — no dependencies declared

**`.context-index/`** — exists as a directory, but has no `specs/`, no `charters`, no `constitution.md`. Workspace-level specs are authored over time, not scaffolded up front.

## What's NOT in it

- No `CLAUDE.md` at the workspace root (out of scope per the charter — agent files are repo-level)
- No workspace-level `constitution.md` (the workspace is a coordination layer, not an authority layer)
- No `repos/` directory (users choose their own git topology)

## Testable Scenarios

| Scenario | Expected Behavior |
|----------|-------------------|
| `detectWorkspace(root)` | Returns config with `repos: []` and `dependencies: []` |
| `resolveWorkspaceContext` with `null` slug | Returns empty `siblingRepos` array, no warnings |
| `resolveRef` with any cross-repo ref | Returns `null` (no repos to resolve against) |
| Opening this in Claude Code | Workspace detected, but no cross-repo context is available |

## Next Steps (for a user in this state)

1. Add a repo to the workspace:
   - Either create a new repo inside the workspace and run `/adev:init` in it
   - Or manually add it to `adev-workspace.yaml`
2. Write a workspace-level charter: `/adev:brainstorm` at the workspace root
3. Declare dependencies as repos accumulate

## Notes

This fixture represents a valid but empty workspace. It should be the exact result a user gets from running `/adev:init --workspace` in an empty directory when they choose "skip" at the auto-discovery prompt.
