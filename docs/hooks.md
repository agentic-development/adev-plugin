# Hooks Reference

adev uses hooks to enforce governance, track context reads, and capture session activity. Hooks fire automatically during Claude Code sessions based on trigger points and tool matchers. For background on how hooks fit into gate-based governance, see [Core Concepts](concepts.md).

## Hook Protocol

All hooks follow the same protocol:

- **Input:** Hooks read JSON from stdin and `CLAUDE_TOOL_INPUT_*` environment variables
- **Output:** Hooks write JSON to stdout
- **Exit codes:**
  - `exit 0` — allow (the operation proceeds)
  - `exit 2` — block (the operation is rejected with a message to the user)
- **Registration:** Hooks are registered in `hooks/hooks.json` with trigger points and matchers

> **Security note:** Custom hook scripts should validate and sanitize all stdin input before processing. Hook scripts receive arbitrary JSON from the tool pipeline and must not blindly trust or execute input content. Use JSON parsing with error handling and validate expected fields before acting on them.

## Summary Table

| Hook | Trigger Point | Matcher | Behavior | Purpose |
|------|---------------|---------|----------|---------|
| `session-start` | SessionStart | `startup\|resume\|clear\|compact` | Advisory | Inject project context at session start |
| `context-preflight` | PreToolUse | Edit | Blocks | Validate context exists before edits |
| `constitution-linter` | PreToolUse | Edit | Blocks | Block edits that violate the constitution |
| `lifecycle-gate-edit` | PreToolUse | Edit | Blocks | Block edits that bypass lifecycle gates |
| `merge-guard` | PreToolUse | Bash | Blocks | Block merges to protected branches |
| `lifecycle-gate-bash` | PreToolUse | Bash | Blocks | Block bash commands that bypass lifecycle gates |
| `context-read-tracker` | PostToolUse | Read | Advisory | Track which context files have been read |
| `sync-trigger` | PostToolUse | Edit | Advisory | Trigger sync after constitution edits |
| `session-capture` | PostToolUse | `.*` (all) | Advisory | Capture session activity for retrospectives |
| `issue-reminder` | PostToolUse | `.*` (all) | Advisory | Remind about relevant open issues |
| `lifecycle-gate-advisory` | PostToolUse | `.*` (all) | Advisory | Emit advisory warnings about lifecycle state |

---

## SessionStart Hooks

These hooks fire when a Claude Code session starts, resumes, or is cleared/compacted.

### session-start

**Script:** `hooks/session-start.sh`
**Matcher:** `startup|resume|clear|compact`
**Behavior:** Advisory (exit 0 always)

**Purpose:** Injects project context at session startup or resume. Reads the context index to provide the agent with project identity, active plans, open issues, and recent session history so it can resume work effectively.

**What it does:**
- Detects the project's context index and loads key artifacts
- Injects a context summary into the session
- Reports active implementation state if a plan is in progress

---

## PreToolUse Hooks

These hooks fire before a tool executes. Blocking hooks (exit 2) prevent the tool from running.

### context-preflight

**Script:** `hooks/context-preflight.sh`
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Validates that the agent has read necessary context before editing files. Prevents edits to spec-tracked code without first reading the relevant spec.

**What triggers a block:**
- Editing a file covered by a spec without having read the spec in this session

**What the user sees:**
- An error message identifying the file and the spec that should be read first

**Resolution:**
1. Read the spec file identified in the error message
2. Retry the edit

---

### constitution-linter

**Script:** `hooks/constitution-linter.sh`
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Blocks edits that violate the constitution's non-negotiable principles. Checks proposed edits against principle patterns (e.g., blocking CommonJS in an ESM project).

**What triggers a block:**
- Editing a file in a way that violates a declared principle (e.g., using `require()` in a pure-ESM project)

**What the user sees:**
- An error message identifying the violated principle and the problematic edit

**Resolution:**
1. Revise the edit to comply with the constitution
2. If the principle itself needs updating, edit `constitution.md` first, then run `/adev:sync`

---

### lifecycle-gate-edit

**Script:** `hooks/lifecycle-gate-edit.sh`
**Matcher:** Edit
**Behavior:** Blocks

**Purpose:** Blocks edits that bypass lifecycle gates. Prevents direct edits to implementation files when the spec has not been reviewed, or edits to spec files when a plan is in progress.

**What triggers a block:**
- Editing implementation files when the governing spec's review status is not "passed"
- Editing spec files while an active implementation plan exists for that spec

**What the user sees:**
- An error message explaining which lifecycle gate was violated

**Resolution:**
1. For missing review: run `/adev:review-specs` on the governing spec
2. For active plan conflict: complete or abandon the current plan before editing the spec

---

### merge-guard

**Script:** `hooks/merge-guard.sh`
**Matcher:** Bash
**Behavior:** Blocks

**Purpose:** Blocks merge commands to protected branches. Prevents `git merge` or `git push` to branches listed in `completion.protected_branches` (default: main, master).

**What triggers a block:**
- Running `git merge` targeting a protected branch
- Running `git push` to a protected branch

**What the user sees:**
- An error message identifying the protected branch and suggesting to open a PR instead

**Resolution:**
1. Create a pull request: `gh pr create --base main`
2. Or, if you need to merge directly, remove the branch from `protected_branches` in `manifest.yaml` (not recommended)

---

### lifecycle-gate-bash

**Script:** `hooks/lifecycle-gate-bash.sh`
**Matcher:** Bash
**Behavior:** Blocks

**Purpose:** Blocks bash commands that bypass lifecycle gates. Prevents running implementation commands (e.g., file creation, code generation) when lifecycle prerequisites are not met.

**What triggers a block:**
- Running bash commands that create or modify implementation files without a reviewed spec

**What the user sees:**
- An error message explaining the lifecycle prerequisite that is missing

**Resolution:**
1. Complete the required lifecycle step (review, plan, etc.) before running the command
2. If the command is not implementation-related, it may be a false positive — check the hook's matcher configuration

---

## PostToolUse Hooks

These hooks fire after a tool executes. They are always advisory (exit 0) and do not block operations.

### context-read-tracker

**Script:** `hooks/context-read-tracker.sh`
**Matcher:** Read
**Behavior:** Advisory

**Purpose:** Tracks which context files have been read during the session. Maintains a read log so other hooks (like `context-preflight`) can verify that agents have read necessary context before editing.

**What it does:**
- Records the file path and timestamp when a context file is read
- Updates the session read log

---

### sync-trigger

**Script:** `hooks/sync-trigger.sh`
**Matcher:** Edit
**Behavior:** Advisory

**Purpose:** Detects edits to `constitution.md` and reminds the agent to run `/adev:sync` to propagate changes to agent configuration files.

**What it does:**
- Checks if the edited file is `constitution.md`
- If so, emits a reminder to run `/adev:sync`

---

### session-capture

**Script:** `hooks/session-capture.sh`
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Captures session activity for retrospective analysis. Records tool invocations, file changes, and timing data that `/adev:retro` uses to compute delivery metrics.

**What it does:**
- Logs tool invocations with timestamps
- Records file paths and operation types
- Writes session data to the configured capture provider

---

### issue-reminder

**Script:** `hooks/issue-reminder.sh`
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Reminds the agent about relevant open issues when working on related files. Helps maintain awareness of known bugs, pending tasks, and related work items.

**What it does:**
- Checks if the current file or operation relates to any open issues
- If relevant issues exist, emits a reminder with issue IDs and titles

---

### lifecycle-gate-advisory

**Script:** `hooks/lifecycle-gate-advisory.sh`
**Matcher:** `.*` (all tools)
**Behavior:** Advisory

**Purpose:** Emits non-blocking advisory warnings about lifecycle state. Unlike the blocking lifecycle gates, this hook warns about best-practice violations without preventing the operation.

**What it does:**
- Checks for lifecycle state issues that are not severe enough to block
- Emits advisory warnings (e.g., "spec is stale", "plan has uncompleted tasks")
- Warnings are informational and do not prevent the operation
