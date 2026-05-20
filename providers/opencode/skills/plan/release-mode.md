## Mode: Release

## Release Mode

Activated by `--release <name>` or by keyword detection ("plan release v2" -> `name: "v2"`).

### Release Mode — Workspace-Mode Branching

When `detectWorkspace(cwd)` returns non-null **AND** `currentRepoSlug === null` (i.e., invoked at the workspace root, not inside a registered repo), enter this workspace mode branch. Otherwise use the existing Release Mode Flow unchanged.

**Workspace-mode Step 1 (product.md read):** Read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs` for the milestone section matching `<release-name>`. If no match, prompt as in repo mode.

**Workspace-mode Step 2 (feature list):** Build the feature list by globbing:
- Workspace-level charters: `<workspaceRoot>/.context-index/specs/features/*/charter.md`
- Per-repo charters via `resolveWorkspaceContext(...).siblingRepos[]`: for each sibling repo, glob `<contextPath>/specs/features/*/charter.md`. Apply `assertPathInWorkspace(workspaceRoot, repo.path)` before reading; on `PATH_ESCAPE`, skip the repo with a warning. Apply `readCappedText(file, MAX_CHARTER_FILE_BYTES)` per file. Stop after `MAX_CHARTER_FILES` files loaded in declaration order and warn.
- Annotate each feature entry as `workspace/<module>` or `<repo-slug>/<module>`. **The annotation is display-only in the plan text — NOT persisted to work-item frontmatter** (avoids conflict with `target-repo` convention).

**Workspace-mode Step 3 (dependency graph):** Edges from three sources, all read via `resolveWorkspaceContext(...).dependencyGraph` (do NOT re-parse `adev-workspace.yaml`):
1. Each feature charter's `Dependencies` table
2. Each feature's specs' `depends-on` frontmatter (cross-repo-aware)
3. Workspace repo-to-repo edges

**Dependency inheritance rule:** A workspace edge `{ from: A, to: B }` contributes Feature-level edges from every Feature in repo A to every Feature in repo B. Additive (does not replace explicit spec-level `depends-on`). **NOT transitive** — direct edges only; no transitive closure computed. Cycles (including those arising from inheritance) fall back to declaration order with a warning.

**Workspace-mode Step 4 (topo-sort):** Tie-breakers: (a) upstream repo order from workspace dependency graph, (b) declaration order in workspace `product.md`. Cycles fall back to declaration order with a warning, matching single-repo behaviour.

**Workspace-mode Step 5 (epic creation):** Skip epic-board `create()` calls **unconditionally**. Persist the release plan to workspace `product.md` only. Print:
```
Release plan for '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability deferred. See multi-repo-workspace charter Deferred Capabilities.
```

### Release Mode Flow

1. **Read `product.md`.** Look for a milestone or release section matching `<release-name>` (case-insensitive). If no match is found, prompt the user to create the milestone or cancel:
   ```
   No milestone named '<release-name>' found in product.md.
   Would you like to define it now? (yes / cancel)
   ```
2. **Identify release features.** Extract the list of features/modules named in the release milestone section.
3. **Check existing work items.** If a release Epic already exists on the issue board, call `walkTree(<release-epic-id>)` to get its current child Epics. This is the source of truth for current state.
4. **Build dependency graph.** For each feature:
   - Read its charter's `Dependencies` table (if present).
   - Read each feature's specs for `depends-on` frontmatter fields.
   - Construct a directed graph: `feature A -> feature B` means A depends on B (B must be planned/built first).
5. **Sequence the release plan.** Perform a topological sort (upstream first). Identify the critical path. Note any cycles as warnings (fall back to declaration order for cyclic groups).
6. **Produce a sequenced release plan** and present it to the user:
   ```
   Release plan: <release-name>

   Sequenced feature order (upstream first):
     1. <module-A> — no dependencies (start here)
     2. <module-B> — depends on: <module-A>
     3. ...

   Critical path: <module-A> -> <module-B> -> ...
   Risk: <any notes on missing specs or unreviewed specs>

   Approve to create work items? (yes / edit / cancel)
   ```
7. **On approval**, create:
   - A release umbrella Epic if not already present:
     ```
     create({ type: "epic", notes: "Release: <release-name>" })
     ```
   - A child Epic per feature (skip if already present in `walkTree` result):
     ```
     create({
       parent_id: <release-epic-id>,
       type: "epic",
       notes: "Feature: <module>",
       next_action: "Run /adev:plan --feature <module> to break into Features"
     })
     ```
8. **Report:** "Release plan for `<release-name>` created with `<N>` Epics."
