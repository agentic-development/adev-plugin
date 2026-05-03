## Mode: Milestone

## Milestone Mode

Activated by `--milestone <name>` or by keyword detection ("plan milestone Q3" -> `name: "Q3"`).

### Milestone Mode — Workspace-Mode Branching

When `detectWorkspace(cwd)` returns non-null **AND** `currentRepoSlug === null` (i.e., invoked at the workspace root, not inside a registered repo), enter this workspace mode branch. Otherwise use the existing Milestone Mode Flow unchanged.

**Workspace-mode (product.md read/write):** Read `resolveWorkspaceProductPath(workspaceRoot)` from `lib/workspace.mjs`. If the milestone section does not exist, prompt for target date, feature list, and success criteria and write the new milestone to workspace `product.md`.

**Feature name parsing:** Accept bare `<module>` OR qualified `workspace/<module>` / `<repo-slug>/<module>`. Validate BOTH tokens with `validateModuleName(token)` from `lib/workspace.mjs`; reject invalid tokens with error `Invalid module name token: '<input>'. Module names must match [a-zA-Z0-9_-]+.` and error code `INVALID_MODULE_NAME` **before any filesystem lookup**.

**Ambiguous bare `<module>`** (matches both a workspace charter and a repo charter): prompt the user to disambiguate. The written milestone line always records the qualified form.

**Isolation invariant:** In workspace mode the skill **never writes to any registered repo's `product.md`**. Workspace milestones are workspace-scoped artefacts. This is an isolation violation per the charter's quality attributes.

**Epic creation:** Skip epic-board `create()` calls **unconditionally** (same as Release Mode). Print deferral message substituting `Milestone '<name>'` for `Release plan for '<name>'` in first line:
```
Milestone '<name>' written to workspace product.md only.
Workspace-level issue-board sync is deferred to the Shared Issue Tracking
capability (Phase 2). See multi-repo-workspace charter Deferred Capabilities.
```

### Milestone Mode Flow

1. **Read `product.md`.** Look for a milestone section matching `<name>`. If none found, prompt the user to define it:
   - Ask for: target date, feature list, success criteria.
   - Write the new milestone definition to `product.md`.
2. **Create or update the milestone Epic:**
   ```
   create({ type: "epic", notes: "Milestone: <name>. Target: <date>" })
   ```
   If a milestone Epic already exists, update its `notes` field; do not create a duplicate.
3. **Create Feature placeholders** for each feature named in the milestone:
   ```
   create({
     parent_id: <milestone-epic-id>,
     type: "feature",
     spec_ref: null,
     next_action: "Run /adev:plan --feature <module> to break into Features"
   })
   ```
4. **Set target date** in the Epic's notes (or a dedicated field if the issue manager supports it).
5. **Report:**
   ```
   Milestone '<name>' planned.
   Epic: <epic-id>
   Feature placeholders: <N>
   Target date: <date>
   ```
