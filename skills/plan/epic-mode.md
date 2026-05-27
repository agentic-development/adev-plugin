## Mode: Epic

## Epic Mode

Activated by `--epic <id>` or by keyword detection ("plan epic epic-3" -> `id: "epic-3"`).

### Epic Mode Flow

1. **Read the named Epic** from the issue board. If the Epic does not exist, block with a clear error.
2. **Call `walkTree(<epic-id>)`** to get existing child Features and Tasks.
3. **Identify missing Features.** Compare the Epic's `notes` field (which may describe expected capabilities) and any associated charter against the actual child Features already in the tree.
4. **Propose Feature creation** for each gap — behavior thereafter matches Feature Mode (Step 3 onward of Feature Mode).
5. **On approval**, create missing Feature work items:
   ```
   create({
     parent_id: <epic-id>,
     type: "feature",
     spec_ref: null,
     next_action: "Run /adev:plan --feature <module> to break into Features"
   })
   ```
6. **Report:** "Epic `<epic-id>` now has `<N>` Features (`<M>` newly created)."

---

## next_action Convention Table

Every work item created in any mode must have its `next_action` field populated. Use the exact strings below. Token placeholders align with WorkItem field names (e.g., `<spec_ref>` is the Feature's `spec_ref` field value).

| Work Item | State | next_action value |
|-----------|-------|-------------------|
| Task | plan exists, not yet routed | `"Run /adev:route --plan <plan_path> to score tasks for execution mode"` |
| Task | routed | `"Run /adev:implement to do RED-GREEN-REFACTOR for this Task"` |
| Feature | without spec | `"Run /adev:specify --module <module> to author this Feature"` |
| Feature | spec exists, needs review | `"Run /adev:review-specs --module <module>"` |
| Feature | spec reviewed and passing | `"Run /adev:plan --spec <spec_ref> to decompose into Tasks"` |
| Feature | plan exists, not yet routed | `"Run /adev:route --plan <plan_path> to score tasks for execution mode"` |
| Epic | no Features | `"Run /adev:plan --feature <module> to break into Features"` |
| Epic | all Features planned | `"Run /adev:plan --epic <id> to verify decomposition"` |

Substitute the actual value for each token at creation time. Do not leave literal `<module>`, `<spec_ref>`, or `<id>` in persisted work items — replace them with the real values.
