## Mode: Workspace Build

When `--phase <name>` is invoked at the workspace root (`detectWorkspace(cwd)` returns non-null AND `currentRepoSlug` is `null`), the skill enters workspace-mode build. This mode orchestrates builds across multiple repos using the workspace dependency graph. When no workspace is detected, or when `currentRepoSlug` is set, behaviour is unchanged — the existing single-repo phase mode applies, and single-repo behaviour is preserved identically.

### Workspace Detection and Mode Entry

1. **Detect workspace:** Call `detectWorkspace(cwd)`. If the result is non-null and `currentRepoSlug` is `null`, enter workspace-mode build. Otherwise, use the standard Phase Mode (above).
2. **Read dependency graph:** Load the workspace dependency graph via `resolveWorkspaceContext(workspaceRoot, null).dependencyGraph`. Each edge has the form `{ from: <repo-slug>, to: <repo-slug> }`, meaning `from` depends on `to` (i.e., `to` is upstream of `from`).

### Input Hardening

Paths derived from `adev-workspace.yaml` (repo `path` values) are treated as untrusted input. Before reading any repo's `.context-index/`, apply `assertPathInWorkspace(workspaceRoot, repoPath)` from `lib/workspace.mjs`. On `PATH_ESCAPE`, skip the repo with a warning:

```
Warning: repo '<slug>' path escapes workspace root. Skipping.
```

### Topological Repo Ordering

3. **Sort repos topologically (upstream first):** Order registered repos so that upstream repos (the `to` side of dependency edges) are built before downstream repos (the `from` side). Use Kahn's algorithm or depth-first topological sort on the dependencyGraph.
   - Example: if `api` depends on `core`, build `core` first, then `api`.

4. **Circular dependencies — warning, fall back to declaration order:** If a cycle is detected in the dependency graph, emit a warning:
   ```
   Warning: circular dependency detected among workspace repos: <repo-A> -> <repo-B> -> <repo-A>
   Falling back to declaration order. Resolve cycles in workspace config before relying on topological ordering.
   ```
   Then proceed using the order in which repos are declared in `adev-workspace.yaml`.

5. **No dependency graph → declaration order:** If the dependency graph is empty or absent, process repos in the order they are declared in `adev-workspace.yaml`.

### Cross-Repo Build Execution

6. **Per-repo build:** For each repo in topological order, execute the build pipeline within that repo's context. The orchestrator delegates to `/adev:plan --phase <name>` and `/adev:implement` within each repo's `.context-index/` directory. The 5-step pipeline (review, plan, route, implement, validate) runs per-spec within each repo, following the same rules as single-repo Phase Mode.

7. **Upstream failure → skip dependents:** When a repo's build fails (any spec within that repo fails at any pipeline step), downstream repos that depend on the failed repo are skipped with reason: `"Upstream repo '<slug>' failed."` Repos that do not depend on the failed repo continue building.

### Build Progress Reports

8. **Repo start header:** When the workspace-mode build starts processing a repo, print:
   ```
   [<current>/<total>] Building repo: <repo-slug>
   ```

9. **Repo completion line:** When the workspace-mode build finishes processing a repo, print:
   ```
   [<current>/<total>] Repo <repo-slug>: <PASSED|FAILED> (<N> specs)
   ```

### Workspace Build Summary

After all repos are processed, print the cross-repo summary:

```
Workspace build for phase '<name>' complete.

  <N> repos attempted, <P> passed, <F> failed, <S> skipped

  Repo results:
    - <repo-slug>: PASSED (N specs passed)
    - <repo-slug>: FAILED (N passed, M failed)
    - <repo-slug>: SKIPPED (upstream '<dep-slug>' failed)
```
