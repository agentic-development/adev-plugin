---
name: adev:issues
description: "Manage project issues and epics. Create, update, close, and view issues across file-based or beads_rust backends. Use when the user says 'create an issue', 'file a bug', 'show issues', 'what needs to be done', 'create epic', 'issue board', or wants to manage work items directly."
---

# Issue Management

Manage project issues and epics using the configured task backend.

**Announce at start:** "I'm using the adev:issues skill to manage project issues."

## Execution Protocol

**Silent execution (subagent mode):** When this skill is invoked as a subagent (via the Agent tool from a parent orchestrator), execute all steps silently:
- Chain steps continuously without intermediate commentary or narration.
- Do NOT emit confirmations like "Loaded the context" or "Proceeding to step N."
- Do NOT summarize intermediate findings between steps.
- Use parallel tool calls (multiple Read/Grep/Glob in one turn) for context-loading phases.
- Report ONLY the final result in the structured format expected by the parent.

This directive does NOT apply when:
- The skill is invoked interactively by a user.
- The subagent prompt contains `VERBOSE: true` (debug mode — narrate all steps).

## Arguments

- No arguments: display the full issue board
- `create "<title>" [--type bug|feature|task] [--epic <epic-id>] [--priority 0-4]`: create an issue
- `epic "<title>" [--milestone <name>]`: create a new epic, optionally assigning it to a milestone
- `update <id> --status <open|in_progress|closed|deferred> [--milestone <name>]`: update issue status and/or milestone (for epics). `--status` and `--milestone` can be used together or independently — both fields are updated in a single call
- `close <id> --reason "<text>"`: close an issue with a reason
- `list [--status <status>] [--epic <epic-id>] [--milestone <name>]`: filtered issue list. `--milestone` filters to epics and issues belonging to epics with that milestone
- `dep <issue-id> <depends-on-id>`: add a blocking dependency
- `ready`: show actionable issues (open + unblocked)

## Prerequisites

Check that `.context-index/` exists with `manifest.yaml`. If not:

> Run `/adev:init` first to set up the context index.

## Process

### Backend Resolution

Read `tasks.backend` from `.context-index/manifest.yaml`. Use `getIssueManager(manifest)` from `lib/issues/registry.mjs` to get the active adapter. Default is `file`.

If the issue board has not been initialized, call `init()` on the adapter to create the storage.

### Board Display (no arguments)

Read all epics and issues. Display grouped by epic, then by status. **Persona adaptation:** The formats below are defaults for the Developer persona. If a different persona is active, adapt the chat display to its output rules.

1. **Open / In Progress** — active work (show first)
2. **Deferred** — parked items
3. **Closed** — completed (show last, collapsed if more than 10)

Standalone issues (no epic) appear under "Unassigned."

#### Milestone Grouping

When any epic has a `milestone` field set, group epics by milestone name with a heading per milestone. Epics without a milestone assignment appear under a "No Milestone" group at the end. Within each milestone group, the existing epic/status grouping applies as described above.

When no epics have milestones, the display format is unchanged (no milestone grouping headers are shown).

Format (with milestones):

```
## Issue Board

## Milestone: v1

### Epic: epic-1 — Auth Feature (open)

| ID | Title | Status | Priority | Type | Deps |
|----|-------|--------|----------|------|------|
| issue-1 | Login flow | closed | 2 | task | |
| issue-2 | Session management | in_progress | 2 | task | issue-1 |

## No Milestone

### Epic: epic-3 — Misc Improvements (open)

| ID | Title | Status | Priority | Type | Deps |
|----|-------|--------|----------|------|------|
| issue-4 | Update docs | open | 3 | task | |

### Unassigned

| ID | Title | Status | Priority | Type | Deps |
|----|-------|--------|----------|------|------|
| issue-5 | Fix typo in README | open | 4 | bug | |
```

When no epics have milestones, omit the milestone headings and display the board in the original flat format.

### Create Issue

Call `create()` from the active adapter with provided fields. Defaults: type `task`, priority `2`, status `open`.

If `--epic` is provided, set the `epicId` field. Validate the epic exists by checking if the ID starts with `epic-`.

Report: "Created `<id>`: <title> (status: open, priority: <N>)"

### Create Epic

Call `createEpic({ title, milestone })` with the title and optional milestone. When `--milestone <name>` is provided, pass the `milestone` field to set it on the epic. When `--milestone` is omitted, the epic is created without a milestone (backward compatible).

Report: "Created `<id>`: <title>" — or when a milestone is set: "Created `<id>`: <title> (milestone: <name>)"

### Update

Determine if `<id>` is an issue (`issue-N`) or epic (`epic-N`) by prefix:
- `issue-*`: call `update(id, { status })` on the adapter
- `epic-*`: call `updateEpic(id, { status })` on the adapter

Respect the close-guard invariant — if status change to `closed` is attempted via update, direct the user to use `close` instead.

### Close

Call `close(id, reason)` on the adapter. If blocked by unclosed dependencies, report:

> Cannot close `<id>`: blocked by `<dep-id-1>`, `<dep-id-2>`. Close those issues first.

### List (filtered)

Call `list(filters)` with provided filters (`--status`, `--epic`, `--milestone`). When `--milestone <name>` is provided, filter to only epics with that milestone and their child issues. If no epics match the milestone, show an empty table with the message: "No epics found for milestone '<name>'."

Display as a table sorted by priority.

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
