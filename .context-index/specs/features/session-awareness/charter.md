---
status: approved
revision: 3
updated: 2026-05-19
---

# Feature Charter: Session Awareness

## Business Intent

The session-awareness module provides continuous context about active work throughout an agent session. It solves three problems: (1) sessions start cold with no knowledge of prior work, (2) the agent drifts from tracked issues during long sessions, and (3) execution state (current plan, task, blockers) is lost on session compaction or restart. It does this by maintaining a live execution state file, injecting it at session start, and periodically surfacing issue reminders mid-session via hook-based context injection.

### Storage Format Authority

This charter retains ownership of *what* execution state means: session-start cold-resume semantics, in-session reminder cadence, `next_action` propagation, the issue-reminder hook contract. *How* execution state is persisted on disk — the `.context-index/.execution-state.json` schema (renamed from `.execution-state.md`), `lib/execution-state.mjs` read/write helpers, atomic temp-rename writes, and the bash-hook decoupling that invokes a Node helper rather than parsing inline YAML — is owned by the `agent-reliable-state-artifacts` charter. See `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`.

## Scope and Boundaries

### In Scope

- Execution state file (`.context-index/.execution-state.md`) — live task progress with well-defined YAML frontmatter schema, updated by skills during implementation
- Session log format — documented JSONL schema for tool-call tracking, consumable by external tools
- Stable file format contract — execution state and session logs are self-describing, readable without plugin internals
- Atomic writes for concurrent access safety
- Mid-session issue reminder hook (Claude Code) — PostToolUse hook that surfaces active issues every N tool calls and after git commits
- Session-start resume injection (Claude Code) — extend `session-start.sh` to read execution state and inject resumption context
- Configurable reminder interval via `tasks.reminder_interval` in manifest.yaml
- Skill-level instructions for checking and updating execution state at task boundaries (harness-agnostic)

### Out of Scope

- Learnings/patterns capture (separate concern)
- Context freshness hashing / stale spec detection (hygiene concern)
- Session summary writing (already handled by `lib/session-summary.mjs`)
- Modifications to the issue board format or task-management adapters
- External consumers (MCP servers, sync services, dashboards) — designed for but not built here
- Harness-specific integrations beyond Claude Code hooks

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Hooks | internal module | Claude Code hook registration for reminder delivery |
| Task Management | internal module | Reads issue board for active issues |
| Implementation | internal module | `adev-implement` writes execution state during task execution |
| Setup | internal module | `session-start.sh` extended for resume injection |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| ExecutionState | Live snapshot of current work in progress | planRef, currentTask (number), issueBinding (issue ID), status (idle/active/blocked), progress (checklist of tasks with done/pending), blockers (free text), nextAction (free text), updated (ISO timestamp) |
| SessionLog | Append-only record of tool calls within a session | Sequence of SessionLogEntry records |
| SessionLogEntry | Single tool invocation record | sessionId, tool (name), files (paths touched), timestamp |
| ReminderConfig | Controls when and how reminders fire | interval (number of tool calls), commitTrigger (boolean) |

### Relationships

- An ExecutionState references zero or one Plan (via planRef) and zero or one Issue (via issueBinding)
- A SessionLog contains zero or more SessionLogEntries
- ReminderConfig is read from manifest.yaml (`tasks.reminder_interval`)

### Invariants

- ExecutionState status is one of: `idle`, `active`, `blocked`
- When status is `idle`, planRef and currentTask are empty
- When status is `active`, planRef and currentTask are set
- SessionLogEntry timestamp is monotonically increasing within a session
- ExecutionState file is written atomically (temp-file-then-rename)

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Execution State File | Read/write `.execution-state.md` with defined YAML frontmatter schema, atomic writes | must-have | 1 | validated |
| Issue Reminder Hook | PostToolUse hook that surfaces active issues every N tool calls and after git commits | must-have | 1 | validated |
| Session-Start Resume | Extend `session-start.sh` to read execution state and inject resumption context | must-have | 1 | validated |
| Session Log Schema | Documented JSONL schema for session-tracking entries (already captured, needs formal spec) | must-have | 1 | validated |
| Skill-Level State Instructions | Markdown instructions in `adev-implement` for updating execution state at task boundaries | must-have | 1 | validated |
| Configurable Reminder Interval | `tasks.reminder_interval` in manifest.yaml with sensible default | should-have | 1 | validated |
| Idle Nudge | When no issues are in_progress, remind to update the issue board | should-have | 1 | validated |
| Execution State Lib | `lib/execution-state.mjs` — thin read/write abstraction over the state file | should-have | 1 | validated |
| Concurrent Access Safety | Atomic writes via temp-file-then-rename for execution state | should-have | 1 | validated |
| Format Documentation | Document file formats as public contracts in `.context-index/` | nice-to-have | 2 | validated |
| Token Cost Logging | Extend session tracking JSONL with optional per-entry token usage and cost fields | should-have | 2 | validated |
| Session-Capture Self-Skip Guard | Post-commit hook self-skips when the commit only touches `.context-index/sessions/` paths, breaking the recursive "1 commit -> 1 capture -> 1 commit" amplification | should-have | 2 | validated |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Format Documentation | Document file formats as public contracts | Phase 2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `.context-index/.execution-state.md` | file (public contract) | YAML frontmatter + markdown body; readable by any tool or harness |
| `.context-index/.session-tracking.jsonl` | file (public contract) | Append-only JSONL; one entry per tool call |
| `readExecutionState(projectRoot)` | function | Parse execution state file, return structured object |
| `writeExecutionState(projectRoot, state)` | function | Atomic write of execution state file |
| `clearExecutionState(projectRoot)` | function | Reset to idle state (e.g., when plan completes) |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `getIssueManager(manifest)` | Task Management | Read active issues for reminder content |
| `IssueManager.list({ status: 'in_progress' })` | Task Management | Filter for in-progress issues |
| `manifest.yaml` (tasks section) | Setup | Read `reminder_interval` and `backend` config |
| `session-start.sh` hook output | Hooks | Extend existing hook to include execution state in `additionalContext` |
| Plan file structure (`.plan.md`) | Planning | Execution state references active plan |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Interoperability | State files are self-describing with documented schemas. No plugin internals required to parse them. Any harness or external tool can read/write the same files. |
| Performance | Reminder hook must not add perceptible latency. Counter check is a file read; issue board read only happens every N calls. |
| Concurrency | Execution state writes are atomic (temp-file-then-rename). Multiple agents on the same machine can safely read/write. |
| Simplicity | Zero new dependencies. Markdown + YAML frontmatter for state, JSONL for logs. No database, no server. |
| Degradation | If execution state file is missing or malformed, hooks still exit 0 (never block agent work) but inject a warning via `additionalContext`: "Execution state file is missing or corrupt. Run /adev-issues to check issue board status." |
| Testability | All logic testable with Node.js built-in test runner. Hook tested via `runHook()` helper. Lib tested with temp dirs. |
