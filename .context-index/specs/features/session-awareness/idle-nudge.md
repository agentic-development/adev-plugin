---
charter: session-awareness
status: validated
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
---

# Live Spec: Idle Nudge

## Behavioral Contract

### Preconditions

- The Issue Reminder Hook (see `issue-reminder-hook.md`) has triggered a reminder
- The issue board has been read successfully
- `tasks.backend` is configured in `manifest.yaml`

### Behaviors

1. **When** the Issue Reminder Hook triggers and the issue board has zero `in_progress` issues but has `open` issues **then** the `additionalContext` includes an idle nudge listing up to 3 open issues sorted by priority, suggesting the agent pick one up or run `/adev:issues` to review the board.

2. **When** the Issue Reminder Hook triggers and the issue board has zero `in_progress` issues and zero `open` issues **then** the `additionalContext` includes a nudge stating all tracked issues are resolved and suggesting the agent check for untracked work or run `/adev:work` for new tasks.

3. **When** the Issue Reminder Hook triggers and the issue board has zero `in_progress` issues and the execution state is `active` **then** the nudge also warns about a stale execution state: "Execution state shows active work but no issues are in_progress. Run /adev:issues to sync."

4. **When** the Issue Reminder Hook triggers and the issue board has `in_progress` issues **then** the idle nudge does not fire. The standard reminder (from `issue-reminder-hook.md`) is shown instead.

### Postconditions

- When the idle nudge fires, `additionalContext` contains a formatted nudge block
- The nudge never replaces the standard reminder — it is a mutually exclusive path (no in_progress issues = nudge, in_progress issues = standard reminder)
- The nudge always includes an actionable suggestion

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Issue board read already failed | No nudge (handled by Issue Reminder Hook's error fallback) | (no error) |
| Execution state read fails | Nudge fires without stale-state warning | (no error) |

## Nudge Block Format

### Open Issues Available

```markdown
---
name: idle-nudge
description: "No issues are in progress. Consider picking up the next task."
---

# No Active Work

No issues are currently in_progress. Here are the next open issues by priority:

| ID | Title | Priority | Type |
|----|-------|----------|------|
| issue-17 | Add session log schema docs | 2 | task |
| issue-18 | Update format documentation | 3 | task |
| issue-19 | Add integration test for reminders | 3 | task |

Pick one up with `/adev:issues update <id> --status in_progress`, or run `/adev:issues` to review the full board.
```

### All Issues Resolved

```markdown
---
name: idle-nudge
description: "All tracked issues are resolved."
---

# All Issues Resolved

All tracked issues are closed or deferred. If there is more work to do, run `/adev:work` to triage new tasks or `/adev:issues create` to file new issues.
```

### Stale Execution State Warning

Appended to either nudge format above when execution state is `active` but no issues are `in_progress`:

```markdown

**Warning:** Execution state shows active work (plan: <planRef>, task: <currentTask>) but no issues are in_progress. This may indicate the issue board is out of sync. Run `/adev:issues` to review and update.
```

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Reuses `getIssueManager` and `readExecutionState` from existing libs. No new dependencies.
- **Principle 4: "Hook protocol compliance"** — Output is part of the Issue Reminder Hook's `additionalContext`, maintaining the same JSON contract.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement idle detection | Check issue board for in_progress count; branch to nudge path | small |
| Format nudge blocks | Build nudge markdown for open-issues and all-resolved cases | small |
| Add stale state detection | Compare execution state against issue board; append warning if mismatched | small |
| Add tests | Idle nudge with open issues, all resolved, stale state warning, standard reminder not affected | medium |

## Acceptance Criteria

- [ ] Nudge fires when no issues are `in_progress` but open issues exist
- [ ] Nudge lists up to 3 open issues sorted by priority
- [ ] Nudge fires with "all resolved" message when no open or in_progress issues exist
- [ ] Stale execution state warning appears when execution state is active but no issues are in_progress
- [ ] Standard reminder fires (not nudge) when in_progress issues exist
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
