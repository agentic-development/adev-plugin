## Mode: Feature

## Feature Mode

Activated by `--feature <module>` or by keyword/state detection routing to this mode.

### Precondition Gate (CHARTER_GATE)

Read the charter at `.context-index/specs/features/<module>/charter.md`. If the charter does not exist, or its status is `draft` or `in-progress`, block:
```
CHARTER_GATE: Charter for module '<module>' must be approved before Feature Mode planning.
Create or approve the charter with /adev:brainstorm --module <module>.
```

### Feature Mode Flow

1. **Read the charter.** Extract the Capability Map (table of capabilities with status columns).
2. **Identify gaps.** Find capabilities that lack a corresponding Live Spec (`*.md` in the module's spec directory). A capability lacks a spec if no spec file's frontmatter references it, or if no spec file exists at all for the module.
3. **Propose Live Specs.** For each gap, produce a proposed spec entry:
   - Title (derived from capability name)
   - Scope (one sentence describing what the spec would cover)
   - Suggested file path: `.context-index/specs/features/<module>/<slug>.spec.md`
   - `next_action` (from convention table): `"Run /adev:specify --module <module> to author this Feature"`
4. **Present the proposed Feature plan** to the user for approval:
   ```
   Feature plan for module: <module>

   Capabilities lacking specs:
     1. <capability-name> → proposed spec: <path>
        next_action: Run /adev:specify --module <module> to author this Feature
     2. ...

   Approve this plan to create Feature work items? (yes / edit / cancel)
   ```
5. **On approval**, create work items via the issue manager:
   - If no Epic exists for this charter, create one first:
     ```
     create({ type: "epic", notes: "Charter: <module>" })
     ```
   - For each proposed spec, create a Feature work item:
     ```
     create({
       parent_id: <epic-id>,
       type: "feature",
       spec_ref: null,
       next_action: "Run /adev:specify --module <module> to author this Feature"
     })
     ```
6. **Report:** "Created `<N>` Feature work items under Epic `<epic-id>`."
