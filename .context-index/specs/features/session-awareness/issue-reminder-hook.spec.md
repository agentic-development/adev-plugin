---
charter: session-awareness
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
source-manifest:
  sha: "85a9e32"
  files:
    - hooks/issue-reminder.sh
    - hooks/issue-reminder.mjs
    - hooks/hooks.json
    - tests/hooks/issue-reminder.test.mjs
  computed-at: "2025-04-25T00:00:00.000Z"
drift_detected: true
---

# Live Spec: Issue Reminder Hook

## Behavioral Contract

### Preconditions

- A PostToolUse hook is registered in `hooks/hooks.json` matching all tools (`.*`)
- `tasks.backend` is configured in `.context-index/manifest.yaml`
- `lib/issues/registry.mjs` and `lib/execution-state.mjs` are available for import via Node.js
- `.context-index/.reminder-counter` file may or may not exist (created on first use)

### Behaviors

1. **When** the hook fires and the tool call counter (persisted in `.context-index/.reminder-counter`) has not reached the configured interval **then** the hook increments the counter, outputs `{}` to stdout, and exits 0. No reminder is injected.

2. **When** the hook fires and the counter has reached the configured interval **then** the hook resets the counter to 0, reads the issue board for `in_progress` issues, reads the execution state file, formats a reminder block, and outputs it in `additionalContext`. The hook exits 0.

3. **When** the hook fires after a git commit (the tool is `Bash` and the input command contains `git commit`) **then** the hook always triggers a reminder regardless of the counter value. The counter is reset to 0.

4. **When** the reminder triggers and there are `in_progress` issues **then** the `additionalContext` includes a reminder block listing each in-progress issue (ID, title, priority) and the current execution state summary (current task, plan ref, next action).

5. **When** the reminder triggers and there are no `in_progress` issues **then** the hook delegates to the Idle Nudge behavior (see `idle-nudge.md`).

6. **When** `tasks.backend` is not configured in the manifest **then** the hook silently exits 0 with `{}` output. No counter is maintained.

7. **When** the issue board read or execution state read fails for any reason **then** the hook outputs `{}` to stdout and exits 0. It never blocks tool use.

8. **When** the `.reminder-counter` file is missing or malformed **then** the hook treats the counter as 0 and creates/overwrites the file.

### Postconditions

- The hook always exits 0
- The hook always outputs valid JSON to stdout
- The `.reminder-counter` file contains a single integer after each hook invocation (when `tasks.backend` is configured)
- When a reminder fires, `additionalContext` contains a formatted reminder block
- The counter resets to 0 after every reminder (whether interval-triggered or commit-triggered)

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.backend` not configured | Silent exit 0, no counter | (no error) |
| `.reminder-counter` missing | Treat as 0, create file | (no error) |
| `.reminder-counter` malformed | Treat as 0, overwrite file | (no error) |
| Issue board read fails | Silent exit 0, no reminder | (no error) |
| Execution state read fails | Reminder fires without execution state context | (no error) |
| Manifest unreadable | Silent exit 0 | (no error) |
| Node.js not available | Silent exit 0 (bash fallback) | (no error) |

## Reminder Block Format

The reminder is injected as `additionalContext` in the hook's JSON output.

### With In-Progress Issues

```markdown
---
name: issue-reminder
description: "Periodic reminder of active issues and current execution state."
---

# Active Issues

| ID | Title | Priority |
|----|-------|----------|
| issue-14 | Write execution state with atomic writes | 2 |
| issue-15 | Read execution state with frontmatter parsing | 2 |

**Current Task:** 2 of 4 (from .context-index/specs/features/session-awareness/execution-state-file.plan.md)
**Next Action:** Implement readExecutionState

Keep these issues updated as you work. Use /adev:issues to update status.
```

### Git Commit Trigger

Same format as above, with an additional line:

```markdown
You just committed code. Verify that in-progress issues reflect your latest changes.
```

## Counter Mechanism

The counter is stored in `.context-index/.reminder-counter` as a single integer (plain text, no frontmatter). This file should be in `.gitignore` as it is transient local state.

- On each PostToolUse invocation: read counter, increment, write back
- On reminder trigger: reset counter to 0 after injecting reminder
- Git commit detection: check if `tool_name === "Bash"` and input contains `git commit` (not `git commit --amend` detection — all commits trigger)

## Git Commit Detection

The hook reads the tool name and input from the PostToolUse stdin JSON. A git commit is detected when:
- `tool_name` is `"Bash"` AND
- The `input` field (command string) matches the pattern `git commit` (substring match, case-sensitive)

This is a heuristic. It will also match `git commit --amend`, `git commit -m "..."`, etc., which is intentional — all commit variants should trigger a reminder.

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses only Node.js built-ins and existing `lib/` modules. No new dependencies.
- **Principle 4: "Hook protocol compliance"** — PostToolUse hook reads JSON from stdin, outputs JSON to stdout, exits 0. Non-blocking.
- **Coding Standard: "Patterns to Follow"** — Follows the bash + inline Node.js pattern from `session-capture.sh`. Counter file follows the flag-file pattern from `context-preflight.sh` (`.context-preflight-ok`).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Implement counter logic | Read/increment/reset `.reminder-counter` file with fallback for missing/malformed | small |
| Implement git commit detection | Parse PostToolUse stdin for Bash tool with git commit command | small |
| Implement reminder builder | Read issue board and execution state, format reminder markdown | medium |
| Register hook | Add PostToolUse entry to `hooks/hooks.json` for `issue-reminder.sh` | small |
| Create hook script | Bash + inline Node.js script following `session-capture.sh` pattern | medium |
| Add tests | Counter logic, git commit detection, reminder formatting, error fallbacks | medium |

## Acceptance Criteria

- [ ] Counter increments on each PostToolUse invocation
- [ ] Reminder fires when counter reaches configured interval
- [ ] Counter resets to 0 after reminder fires
- [ ] Git commits always trigger a reminder regardless of counter
- [ ] In-progress issues are listed in reminder block with ID, title, priority
- [ ] Execution state summary included when available
- [ ] Missing/malformed counter file handled gracefully (treated as 0)
- [ ] Hook silently exits 0 when `tasks.backend` is not configured
- [ ] Hook silently exits 0 on any read failure
- [ ] Hook always outputs valid JSON
- [ ] Hook always exits 0
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
