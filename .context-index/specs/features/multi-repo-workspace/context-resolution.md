---
charter: multi-repo-workspace
status: review-passed
risk_level: medium
revision: 1
charter-revision: 2
created: 2026-04-15
updated: 2026-04-15
depends-on: ["workspace-foundation"]
---

# Live Spec: Context Resolution

## Behavioral Contract

### Preconditions

- `lib/workspace.mjs` exists with `detectWorkspace`
- A workspace is detected with at least one registered repo

### Behaviors

1. **When** `resolveWorkspaceContext(workspaceRoot, currentRepoSlug)` is called **then** it returns a WorkspaceContext object containing: `workspaceName`, `workspaceRoot`, `currentRepo` (slug, path, role, contextPath), `siblingRepos[]` (same shape, excluding current), and `dependencyGraph` (parsed dependencies array).

2. **When** a sibling repo's `.context-index/` exists **then** its path is included in `siblingRepos[].contextPath`. The function does NOT read or parse files inside — it provides paths for skills to read lazily.

3. **When** a sibling repo's `.context-index/` does not exist **then** that repo is included in `siblingRepos` with `contextPath: null` and a warning: "Repo '<slug>' has no .context-index/ — context unavailable."

4. **When** a sibling repo is marked `missing: true` (path doesn't exist on disk) **then** it is excluded from `siblingRepos` entirely with a warning.

5. **When** `currentRepoSlug` is `null` (at workspace root) **then** `currentRepo` is `null` and all repos appear in `siblingRepos`.

6. **When** `currentRepoSlug` does not match any registered repo **then** throw: "Repo '<slug>' not found in workspace."

### Postconditions

- `resolveWorkspaceContext` is exported from `lib/workspace.mjs`
- WorkspaceContext provides paths only — no file parsing, no content caching
- Skills that want workspace context call `resolveWorkspaceContext` and read sibling files on demand

### Error Cases

| Condition | Expected Behavior |
|-----------|-------------------|
| Unknown currentRepoSlug | Throw UNKNOWN_REPO |
| Sibling repo path missing | Exclude with warning |
| Sibling repo has no .context-index/ | Include with contextPath: null, warning |

## Acceptance Criteria

- [ ] `resolveWorkspaceContext` returns correct WorkspaceContext shape
- [ ] `currentRepo` matches the repo containing `startPath`
- [ ] `siblingRepos` excludes the current repo
- [ ] Missing repos are excluded with warnings
- [ ] Repos without `.context-index/` have `contextPath: null`
- [ ] `currentRepoSlug: null` puts all repos in `siblingRepos`
- [ ] Unknown slug throws
- [ ] Dependency graph is included in the context
- [ ] All quality gates pass
