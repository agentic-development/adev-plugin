### Step 1.6: Progress Tracking (Claude Code)

If the `TaskCreate` tool is available (Claude Code environment), create a tracking task for each plan task to provide real-time progress visibility to the user:

```
For each task N in the plan:
  TaskCreate({ title: "Task N: <task-title>", status: "pending" })
```

This creates a visual task list in the Claude Code UI that the user can monitor at a glance.

**If `TaskCreate` is not available** (non-Claude-Code environment — e.g., Cursor, OpenCode), skip this step entirely. Progress is reported via text output as before. Do not error or warn.

**Per-task updates (during Step 2 loop):**
- When starting a task: `TaskUpdate(taskId, { status: "in_progress" })`
- When a task passes review: `TaskUpdate(taskId, { status: "completed" })`
- When a task fails or is blocked: `TaskUpdate(taskId, { status: "failed" })`
- When a task is skipped (already implemented): `TaskUpdate(taskId, { status: "completed" })`

**Cleanup:** After all tasks complete (Step 4: Completion), do not delete the tasks — leave them visible so the user can review the final state.
