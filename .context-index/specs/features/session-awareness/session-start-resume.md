---
charter: session-awareness
status: review-passed
risk_level: low
milestone: 1
revision: 1
charter-revision: 2
created: 2026-04-06
updated: 2026-04-06
---

# Live Spec: Session-Start Resume

## Behavioral Contract

### Preconditions

- `session-start.sh` is registered as a SessionStart hook in `hooks/hooks.json`
- `CLAUDE_PLUGIN_ROOT` env var or relative path resolves to the plugin root
- `lib/execution-state.mjs` is available for import via Node.js

### Behaviors

1. **When** the hook fires and `.context-index/.execution-state.md` exists with `status: active` **then** the `additionalContext` output includes a resume block with the plan reference, current task number, issue binding, next action, and the progress checklist — formatted so the agent can immediately continue work.

2. **When** the hook fires and `.context-index/.execution-state.md` exists with `status: blocked` **then** the `additionalContext` output includes a blocker alert with the blocker text and next action, so the agent knows to address the blocker before continuing.

3. **When** the hook fires and `.context-index/.execution-state.md` exists with `status: idle` **then** no resume block is injected. The hook behaves as before (using-adev skill only).

4. **When** the hook fires and `.context-index/.execution-state.md` does not exist **then** no resume block is injected. The hook behaves as before (no error, no warning).

5. **When** the hook fires and `.context-index/.execution-state.md` is malformed **then** the `additionalContext` includes a warning: "Execution state file is missing or corrupt. Run /adev:issues to check issue board status." The hook still exits 0.

6. **When** the hook fires **then** the existing using-adev skill content is always injected regardless of execution state. The resume block is appended after the skill content, never replaces it.

7. **When** Node.js is not available or the `readExecutionState` call fails for any reason **then** the hook falls back to the current behavior (inject using-adev skill only) and exits 0. It never blocks session start.

### Postconditions

- The hook always exits 0
- The hook always outputs valid JSON to stdout with the `hookSpecificOutput` shape
- The `additionalContext` field always contains the using-adev skill content
- When execution state is active or blocked, `additionalContext` additionally contains the resume block after a `\n---\n` separator

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.execution-state.md` missing | No resume block injected, hook exits 0 | (no error) |
| `.execution-state.md` malformed | Warning injected in additionalContext, hook exits 0 | (no error) |
| Node.js not available | Falls back to skill-only injection, hook exits 0 | (no error) |
| `readExecutionState` throws | Falls back to skill-only injection, hook exits 0 | (no error) |
| `SKILL_FILE` missing | Hook exits 0 with no output (existing behavior, unchanged) | (no error) |

## Resume Block Format

The resume block is a markdown section appended to `additionalContext`. It is NOT a separate JSON field — it is concatenated with the skill content.

### Active State

```markdown
---
name: session-resume
description: "Resumption context from previous session. You were actively working on a plan."
---

# Session Resume

**Status:** active
**Plan:** <planRef>
**Current Task:** <currentTask>
**Issue:** <issueBinding>
**Next Action:** <nextAction>

## Progress

- [x] Task 1: Description
- [x] Task 2: Description
- [ ] Task 3: Description
- [ ] Task 4: Description

Resume from Task <currentTask>. Read the plan file for full context.
```

### Blocked State

```markdown
---
name: session-resume
description: "Resumption context from previous session. Work was blocked."
---

# Session Resume

**Status:** blocked
**Blocker:** <blockers>
**Next Action:** <nextAction>

Address the blocker before continuing implementation.
```

### Malformed State (warning)

```markdown
---
name: session-resume
description: "Warning: execution state file could not be read."
---

Execution state file is missing or corrupt. Run /adev:issues to check issue board status.
```

## Implementation Approach

The hook remains a bash script. It calls Node.js inline (same pattern as `session-capture.sh`) to read the execution state and format the resume block. The bash script concatenates the resume block with the skill content before JSON-encoding.

```
session-start.sh flow:
  1. Read SKILL_FILE content (existing)
  2. Call node to read execution state and produce resume markdown
  3. Concatenate: SKILL_CONTENT + "\n" + RESUME_BLOCK
  4. JSON-encode and output (existing pattern)
```

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Uses `readExecutionState` from `lib/execution-state.mjs` (already exists, no new deps). Node.js invocation follows the `session-capture.sh` pattern.
- **Principle 4: "Hook protocol compliance"** — Output shape is `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "..." } }`. Always exits 0.
- **Coding Standard: "Patterns to Follow"** — Follows the inline Node.js pattern from `session-capture.sh` and the `CLAUDE_PLUGIN_ROOT` resolution from the existing `session-start.sh`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Add resume block builder | Node.js inline script that calls `readExecutionState` and returns formatted markdown or empty string | medium |
| Extend session-start.sh | Integrate the resume block builder into the existing hook, concatenating with skill content | medium |
| Update tests | Add test cases for active resume, blocked resume, idle (no change), missing file, malformed file | medium |

## Acceptance Criteria

- [ ] Active execution state produces a resume block with plan ref, current task, and progress
- [ ] Blocked execution state produces a blocker alert with blocker text
- [ ] Idle execution state produces no resume block (existing behavior unchanged)
- [ ] Missing execution state file produces no resume block (no error)
- [ ] Malformed execution state file produces a warning in additionalContext
- [ ] The using-adev skill content is always present in additionalContext
- [ ] Hook always exits 0 regardless of execution state
- [ ] Hook outputs valid JSON in all cases
- [ ] Node.js failure falls back to skill-only injection
- [ ] All quality gates pass (`npm test`)
- [ ] No new dependencies added
- [ ] No constitutional violations introduced
