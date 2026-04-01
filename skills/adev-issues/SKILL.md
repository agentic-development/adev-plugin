---
name: adev-issues
description: "Manage project issues and epics. Create, update, close, and view issues across file-based or beads_rust backends. Use when the user says 'create an issue', 'file a bug', 'show issues', 'what needs to be done', 'create epic', 'issue board', or wants to manage work items directly."
---

# Issue Management

Manage project issues and epics using the configured task backend.

**Announce at start:** "I'm using the adev-issues skill to manage project issues."

## Arguments

- No arguments: display the full issue board
- `create "<title>" [--type bug|feature|task] [--epic <epic-id>] [--priority 0-4]`: create an issue
- `epic "<title>"`: create a new epic
- `update <id> --status <open|in_progress|closed|deferred>`: update issue status
- `close <id> --reason "<text>"`: close an issue with a reason
- `list [--status <status>] [--epic <epic-id>]`: filtered issue list
- `dep <issue-id> <depends-on-id>`: add a blocking dependency
- `ready`: show actionable issues (open + unblocked)

## Prerequisites

Check that `.context-index/` exists with `manifest.yaml`. If not:

> Run `/adev-init` first to set up the context index.

## Process

### Backend Resolution

Read `tasks.backend` from `.context-index/manifest.yaml`. Use `getIssueManager(manifest)` from `lib/issues/registry.mjs` to get the active adapter. Default is `file`.

If the issue board has not been initialized, call `init()` on the adapter to create the storage.

### Board Display (no arguments)

Read all epics and issues. Display grouped by epic, then by status:

1. **Open / In Progress** — active work (show first)
2. **Deferred** — parked items
3. **Closed** — completed (show last, collapsed if more than 10)

Standalone issues (no epic) appear under "Unassigned."

Format:

```
## Issue Board

### Epic: epic-1 — Auth Feature (open)

| ID | Title | Status | Priority | Type | Deps |
|----|-------|--------|----------|------|------|
| issue-1 | Login flow | closed | 2 | task | |
| issue-2 | Session management | in_progress | 2 | task | issue-1 |

### Unassigned

| ID | Title | Status | Priority | Type | Deps |
|----|-------|--------|----------|------|------|
| issue-5 | Fix typo in README | open | 4 | bug | |
```

### Create Issue

Call `create()` from the active adapter with provided fields. Defaults: type `task`, priority `2`, status `open`.

If `--epic` is provided, set the `epicId` field. Validate the epic exists by checking if the ID starts with `epic-`.

Report: "Created `<id>`: <title> (status: open, priority: <N>)"

### Create Epic

Call `createEpic()` with the title. Report: "Created `<id>`: <title>"

### Update

Determine if `<id>` is an issue (`issue-N`) or epic (`epic-N`) by prefix:
- `issue-*`: call `update(id, { status })` on the adapter
- `epic-*`: call `updateEpic(id, { status })` on the adapter

Respect the close-guard invariant — if status change to `closed` is attempted via update, direct the user to use `close` instead.

### Close

Call `close(id, reason)` on the adapter. If blocked by unclosed dependencies, report:

> Cannot close `<id>`: blocked by `<dep-id-1>`, `<dep-id-2>`. Close those issues first.

### List (filtered)

Call `list(filters)` with provided filters. Display as a table sorted by priority.

### Add Dependency

Call `addDependency(issueId, dependsOnId)`. If a circular dependency would be created, report the cycle.

### Ready

Call `list({ status: "open" })`, then filter out issues whose dependencies include any unclosed issues. Display as "Actionable issues — open and unblocked."

## Key Principles

- **Read-modify-write.** Always read current state before modifying. Do not cache.
- **Backend agnostic.** Instructions work identically for file and beads backends.
- **Graceful errors.** Report clear error messages for validation failures.
- **No lifecycle gating.** This skill is supporting — it does not gate the plan/implement/validate pipeline.
- **Worktree-safe.** Issue storage is automatically shared across git worktrees. The registry resolves the main repo root via git, or uses `tasks.db_path` from manifest if configured.
