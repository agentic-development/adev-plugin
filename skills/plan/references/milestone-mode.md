## Mode: Milestone Planning

## Milestone Planning Mode (`--milestone`)

When `--milestone <name>` is provided, the skill switches from single-spec planning to multi-spec milestone planning:

### Workspace Dependency Ordering

When `--milestone` is used inside a workspace (detected by the presence of a `workspace.yaml` or `.workspace/` configuration at an ancestor directory, or by `workspace` key in `manifest.yaml`):

1. **Detect workspace:** Check whether the current repo is registered in a workspace by reading the workspace config. If no workspace is found, fall back to single-repo behavior (unchanged).
2. **Read dependency graph:** Load the workspace dependency graph (e.g., `workspace.yaml` `dependencies` section or `.workspace/deps.json`). Each entry has the form `from: <repo> → to: <repo>`, meaning `from` depends on `to` (i.e., `to` is upstream of `from`).
3. **Order repos topologically (upstream first):** Sort registered repos so that upstream repos (the `to` side) are planned before downstream repos (the `from` side). This ensures upstream specs are planned and available before repos that depend on them.
   - Example: if `api` depends on `core`, plan `core` first, then `api`.
   - Use Kahn's algorithm or depth-first topological sort on the dependency graph.
4. **Circular dependencies -> warning, fall back to declaration order:** If a cycle is detected in the dependency graph, emit a warning:
   ```
   Warning: circular dependency detected among workspace repos: <repo-A> -> <repo-B> -> <repo-A>
   Falling back to declaration order. Resolve cycles in workspace config before relying on topological ordering.
   ```
   Then proceed using the order in which repos are declared in the workspace config.
5. **No workspace -> existing single-repo behavior:** If the current directory is not inside a workspace, or the workspace has only one registered repo, skip all workspace logic and apply the standard phase planning process below.

1. **Scan all specs:** Read all `*.spec.md` files under `.context-index/specs/features/`. Parse frontmatter for the `milestone` field.
2. **Filter by milestone:** Select specs whose `milestone` matches `<name>` (case-insensitive).
3. **Report matching specs** before planning:
   ```
   Milestone: v1
   Matching specs:
     1. auth/password-login.md — status: implemented ✓
     2. auth/session-management.md — status: review-passed ✓
     3. task-boards/create-boards.md — status: draft ⚠ (not yet review-passed)

   3 specs found. 1 warning (draft spec included but may not be ready for planning).
   → Proceed with planning all review-passed specs? (yes / include drafts / select)
   ```
4. **Warn on non-reviewed specs:** Specs that have not reached `review-passed` status are flagged with a warning. Include them in the plan only if the user confirms.
5. **Ordering:** Plan specs in dependency order:
   - Specs within the same charter are ordered by the charter's Capability Map sequence.
   - Cross-charter dependencies are resolved by reading each spec's preconditions and consumed APIs.
   - If no dependency information is available, group by charter (all specs from one charter together).
6. **Output:** For each qualifying spec, run the standard planning process (Steps 1-7). Save each plan adjacent to its spec as usual. At the end, produce a milestone summary:
   ```
   Milestone v1 planning complete.

   Plans created:
     - .context-index/specs/features/auth/session-management.plan.md (3 tasks)
     - .context-index/specs/features/task-boards/create-boards.plan.md (5 tasks)

   Skipped (already implemented):
     - auth/password-login.md

   Warnings:
     - task-boards/create-boards.md was planned from a draft spec (not review-passed)
   ```

Without `--milestone`, behavior is unchanged (single spec planning via `--spec`).
