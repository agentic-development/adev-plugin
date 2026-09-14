### Mode: Workspace Aggregation (workspace root)

When invoked at a **workspace root** (a directory that contains `workspace.yaml` or `.workspace/` config but is not itself one of the registered repos), enter **workspace mode** to aggregate charter and spec status across all registered repos.

#### Workspace Detection

Call `detectWorkspace()` to determine whether the current directory is a workspace root. If `detectWorkspace()` returns a workspace context, enter workspace mode. Otherwise, fall through to single-repo behaviour.

#### Cross-Repo Status Aggregation

1. Call `resolveWorkspaceContext()` to obtain the list of registered repos, their local paths, and the dependency graph.
2. **Aggregate per repo:** For each registered repo, check for a `.context-index/` directory and read its charters and specs.
   - If the repo directory does not exist or has no `.context-index/`: report `<slug>: no context configured`
   - Otherwise: summarize charter and spec counts by status (same fields as `--all` mode)
3. **Group output by repo**, sorted in topological dependency order (upstream first) when a dependency graph is available.

#### Charter-Revision Staleness Across Workspace

When a workspace-level charter exists (in the workspace `.context-index/`), compare its current `revision` against the `charter-revision` field in each repo-level spec that implements it:

1. Read the workspace charter's current `revision` value.
2. For each registered repo, scan specs whose frontmatter references the workspace charter.
3. If a spec's `charter-revision` is behind the workspace charter's current `revision`, flag that spec as **stale** — its `charter-revision` does not match the workspace charter revision.
4. Include stale specs in the output under a "Stale Charter References" section per repo.

This ensures that when a workspace charter is updated, all repo-level specs tracking it are flagged for re-alignment.

**Output format:**

```
=== Workspace Status ===

repo: core
  Charters: 2 (1 active, 1 draft)
  Specs: 5 (3 implemented, 1 review-passed, 1 draft)
  Capabilities: 8/12 implemented
  Stale Charter References:
    - specs/auth-login.md: charter-revision 2 (workspace charter at 4) — STALE

repo: api
  Charters: 1 (1 active)
  Specs: 3 (2 review-passed, 1 draft)
  Capabilities: 4/9 implemented

repo: frontend
  no context configured
```

#### Repo-Mode-Inside-Workspace Advisory

**When invoked inside a repo (not workspace root):** Use existing single-repo behavior for the full status output. If `detectWorkspace()` detects an ancestor workspace, emit the following advisory to stdout once per invocation:

```
Advisory: running repo-scoped inside workspace at <workspace-path>. Run /adev:status at the workspace root for cross-repo aggregation.
```
