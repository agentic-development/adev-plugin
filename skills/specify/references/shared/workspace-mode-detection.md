## Shared: Workspace-Mode Detection

Before resolving charters, detect workspace context:

1. Call `detectWorkspace(cwd)`. This returns `{ root, config, currentRepoSlug }` or `null`.
   - `currentRepoSlug` is the `slug` field of the registered repo containing `cwd`, from the `detectWorkspace()` return value. It is `null` when `cwd` is the workspace root itself (not inside any registered repo).

2. **If `detectWorkspace()` returns `null`:** No workspace. Proceed with existing single-repo flow unchanged. No workspace-related prompts or frontmatter appear.

3. **If `detectWorkspace()` returns non-null AND `currentRepoSlug !== null`:** Inside a registered repo. Proceed with existing single-repo flow unchanged. The spec is written to the repo's own `.context-index/`. No `target-repo:` prompt appears.

4. **If `detectWorkspace()` returns non-null AND `currentRepoSlug === null`:** At the workspace root. Enter **workspace mode**:
   - Resolve charters from the workspace `.context-index/specs/features/` directory (not from any registered repo).
   - If the workspace `.context-index/` does not exist, suggest: "No workspace context directory found. Run `/adev:init --workspace` to set up workspace-level context." and stop.
   - Specs will be written to the workspace `.context-index/`, not to any registered repo.
   - Continue to "Shared: Load Context" with workspace paths.

### Workspace Mode: target-repo Prompt

After the user selects a capability (Step 3) in workspace mode, prompt for the implementation target:

```
This is a workspace-level spec. Which repo owns the implementation?
Registered repos: <list of repo slugs from adev-workspace.yaml config.repos>
→ target-repo: (slug or "workspace" if no single repo owns it)
```

**Validation:**

1. If the user enters `"workspace"` — accept as-is. This is a reserved token for specs that span repos without a single owner. No slug validation is performed.
2. If the user enters a string matching a registered repo slug — accept. Validate the slug with `validateModuleName()` from `lib/workspace.mjs` to ensure it matches `[a-zA-Z0-9_-]+`.
3. If the user enters an unknown value — reject and re-prompt:
   ```
   Unknown repo slug '<input>'. Available repos: <comma-separated slug list>.
   → target-repo: (try again)
   ```
4. If the value contains characters outside `[a-zA-Z0-9_-]` and is not `"workspace"` — reject:
   ```
   Invalid repo slug: must match [a-zA-Z0-9_-]+
   → target-repo: (try again)
   ```

Re-prompt until a valid value is given.

**Note:** Error codes in the Error Cases table (`INVALID_TARGET_REPO`, `INVALID_MODULE_NAME`, etc.) are for human and agent reference only — they are not emitted programmatically since this is a markdown skill.

### Workspace Mode: Reference Context and Isolation

In workspace mode, load sibling repo context via `resolveWorkspaceContext()` for reference:

- Use `resolveWorkspaceContext(workspaceRoot, null).siblingRepos[]` to get sibling repo `.context-index/` paths.
- These paths are available for reference (e.g., checking if a spec name conflicts with an existing spec in a sibling repo) but the skill never writes to any registered repo's `.context-index/`.

**Isolation invariant:** The skill never writes to any registered repo's `.context-index/`. All workspace-mode output goes to the workspace `.context-index/` only. This is a charter-level invariant (multi-repo-workspace charter, Quality Attributes: Isolation).
