# Implementation Plan: /adev:issues Skill

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/adev:issues-skill.spec.md
> **Review:** PASS_WITH_NOTES (2026-03-31)
> **Platform:** none, javascript (ESM), node:test

**Goal:** Create the `/adev:issues` SKILL.md for user-facing issue management and register it in the plugin.

**Architecture:** Pure markdown skill — structured instructions telling the agent how to use `lib/issues/` for CRUD operations. Follows existing skill patterns (`skills/<name>/SKILL.md`). Registration adds it to the `using-adev` gateway skill's available skills table.

---

## File Structure

**Create:**
- `skills/issues/SKILL.md` — User-facing issue management skill

**Modify:**
- `skills/using-adev/SKILL.md` — Add `/adev:issues` to available skills table

**Reference (read, do not modify):**
- `skills/status/SKILL.md` — Pattern reference for read/query skill structure
- `skills/debug/SKILL.md` — Pattern reference for supporting skill structure
- `.context-index/specs/features/task-management/adev:issues-skill.spec.md` — Spec with all 10 behaviors

## Context Packets

### Task 1 Context
- Spec: `adev:issues-skill.md` (all 10 Behaviors)
- Reference: `skills/status/SKILL.md` (skill structure pattern)
- Spec: `issue-epic-crud.md` (interface methods)
- Spec: `backend-adapters.md` (backend-specific behavior)

### Task 2 Context
- Skill: `skills/using-adev/SKILL.md` (available skills table)

## Parallelization

- Task 1 and Task 2 are independent (different files). Can run in parallel.

---

### Task 1: Write /adev:issues SKILL.md [specialist: none]

**Charter capability:** User-Facing Skill
**Files:**
- Create: `skills/issues/SKILL.md`

**Tests:** No test file — this is a markdown skill. Acceptance verified by reading the file.

- [ ] **Write failing test**

```bash
! test -f skills/issues/SKILL.md
```

- [ ] **Verify test fails** (file does not exist)

- [ ] **Implement**

Create `skills/issues/SKILL.md` with frontmatter and full instructions:

```markdown
---
name: adev:issues
description: "Manage project issues and epics. Create, update, close, and view issues across file-based or beads_rust backends. Use when the user says 'create an issue', 'file a bug', 'show issues', 'what needs to be done', 'create epic', or wants to manage work items directly."
---

# Issue Management

Manage project issues and epics using the configured task backend.

**Announce at start:** "I'm using the adev:issues skill to manage project issues."

## Arguments

- No arguments: display the full issue board
- `create "<title>" [--type bug|feature|task] [--epic <epic-id>] [--priority 0-4]`: create an issue
- `epic "<title>"`: create an epic
- `update <id> --status <open|in_progress|closed|deferred>`: update status
- `close <id> --reason "<text>"`: close an issue
- `list [--status <status>] [--epic <epic-id>]`: filtered list
- `dep <issue-id> <depends-on-id>`: add dependency
- `ready`: show actionable issues (open + unblocked)

## Prerequisites

Check that `.context-index/` exists with `manifest.yaml`. If not:
> Run `/adev:init` first to set up the context index.

## Process

### Backend Resolution

Read `tasks.backend` from `.context-index/manifest.yaml`. Use `getIssueManager(manifest)` from `lib/issues/registry.mjs` to get the active adapter. Default is `file`.

### Board Display (no arguments)

Read all epics and issues. Display grouped by epic, then by status:

1. **Open / In Progress** — active work (show first)
2. **Deferred** — parked items
3. **Closed** — completed (show last, collapsed if >10)

Standalone issues (no epic) appear under "Unassigned."

Format:
> ## Issue Board
>
> ### Epic: epic-1 — Auth Feature (open)
> | ID | Title | Status | Priority | Type | Deps |
> |----|-------|--------|----------|------|------|
> | issue-1 | Login flow | closed | 2 | task | |
> | issue-2 | Session mgmt | in_progress | 2 | task | issue-1 |
>
> ### Unassigned
> | issue-5 | Fix typo in README | open | 4 | bug | |

### Create Issue

Call `create()` from the active adapter with provided fields. Defaults: type `task`, priority `2`, status `open`.

If `--epic` is provided, set the `epicId` field. Validate the epic exists.

Report: "Created `<id>`: <title> (status: open, priority: <N>)"

### Create Epic

Call `createEpic()` with the title. Report: "Created `<id>`: <title>"

### Update

Determine if `<id>` is an issue (`issue-N`) or epic (`epic-N`) by prefix. Call `update()` or `updateEpic()` accordingly. Respect the close-guard invariant — if status change to `closed` is attempted via update, direct the user to use `close` instead.

### Close

Call `close(id, reason)`. If blocked by unclosed dependencies, report: "Cannot close `<id>`: blocked by `<dep-id-1>`, `<dep-id-2>`"

### List (filtered)

Call `list(filters)` with provided filters. Display as a table.

### Add Dependency

Call `addDependency(issueId, dependsOnId)`. If circular, report the cycle path.

### Ready

Call `list({ status: "open" })`, then filter out issues with unclosed dependencies. Display as "Actionable issues — open and unblocked."
```

- [ ] **Verify test passes** — file exists
- [ ] **Commit**

```bash
git add skills/issues/SKILL.md
git commit -m "feat(task-management): add /adev:issues skill"
```

### Task 2: Register in Gateway Skill [specialist: none]

**Charter capability:** User-Facing Skill
**Files:**
- Modify: `skills/using-adev/SKILL.md`

**Tests:** No test file — markdown change.

- [ ] **Write failing test**

```bash
! grep -q "adev:issues" skills/using-adev/SKILL.md
```

- [ ] **Verify test fails** (not registered yet)

- [ ] **Implement**

Add `/adev:issues` to the Available Skills table in `skills/using-adev/SKILL.md`, in the appropriate section (Supporting/Maintenance skills):

```markdown
| `/adev:issues` | Issue Management | Create, update, and track issues and epics |
```

- [ ] **Verify test passes** — grep finds "adev:issues"
- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md
git commit -m "feat(task-management): register /adev:issues in gateway skill"
```

---

## Quality Gates

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied
