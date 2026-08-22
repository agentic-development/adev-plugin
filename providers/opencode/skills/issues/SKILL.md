---
name: adev:issues
description: "Manage project issues and epics. Create, update, close, and view issues across file-based or beads_rust backends. Use when the user says 'create an issue', 'file a bug', 'show issues', 'what needs to be done', 'create epic', 'issue board', or wants to manage work items directly. In OpenCode, invoke with skill({ name: 'adev:issues' })"
---

# Issue Management

Manage project issues and epics using the configured task backend.

**Announce at start:** "I'm using the adev:issues skill to manage project issues."

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

Read `tasks.backend` from `.context-index/manifest.yaml` via `loadManifest` (from `<ADEV_ROOT>/lib/manifest.mjs`). Use `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` to get the active adapter. The default backend is `json` (`.context-index/tasks/tasks.json`); `file` (legacy markdown read-only) and `beads` are also supported.

If the issue board has not been initialized, call `init()` on the adapter to create the storage.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill issues
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Board Display (no arguments)

Call the manager to fetch live data:

```javascript
import { getIssueManager } from '<ADEV_ROOT>/lib/issues/registry.mjs';
import { loadManifest } from '<ADEV_ROOT>/lib/manifest.mjs';

const manager = getIssueManager(loadManifest(projectRoot));
const epics = await manager.listEpics();
const issues = await manager.list();
```

Then render via the canonical markdown layer rather than hand-writing rows:

```javascript
import { renderTasksMd } from '<ADEV_ROOT>/lib/issues/render-markdown.mjs';
const markdown = renderTasksMd({ version: 1, epics, issues });
```

Display the rendered markdown to the user. **Persona adaptation:** the renderer emits the canonical board layout (epic groupings, milestone groupings, status sections). If a different persona is active, adapt the chat display to its output rules — but always source data via the manager and the renderer; never hand-author table rows in skill responses.

Default ordering produced by the renderer:

1. **Open / In Progress** — active work (show first)
2. **Deferred** — parked items
3. **Closed** — completed (show last, collapsed if more than 10)

Standalone issues (no epic) appear under "Unassigned." When any epic has a `milestone` field set, the renderer groups epics by milestone name; epics without a milestone appear under "No Milestone" at the end.

### Create Issue

Call `create()` from the active adapter with provided fields. Defaults: type `task`, priority `2`, status `open`.

If `--epic` is provided, set the `epicId` field. Validate the epic exists by checking if the ID starts with `epic-`.

**Content template (BEH-1, BEH-2):** When `--type bug|feature` is given and no `--notes`/`--body`/`--description` was supplied, prompt the author before creating the issue:

> This is a `<bug|feature>` issue — give it a short body:
> **Problem / Intent:** what's wrong, or what capability is missing, and why it matters
> **Acceptance Criteria:** concrete, checkable outcomes
> **Out of Scope:** what this issue deliberately does not cover

Assemble the three answers into a single `notes` string (the existing `description`/`body` → `notes` alias resolution in `lib/issues/interface.mjs::resolveNotes` handles it unchanged — no new field). When `--type task` (the default) is given, skip this prompt — accept a one-line `--notes` value as-is, since Tasks are typically short and already scoped by a parent Feature's spec.

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

### Milestone Create

`milestone create <name> [--target <YYYY-MM-DD>] [--strategy <manual|tag-only|release-please>] [--check <type>]... [--confirm "<text>"]...`

Create or update a milestone in `.context-index/milestones.json` (via `lib/milestones.mjs`) with an auto-linked epic.

**Arguments:**
- `<name>` (required) — milestone name, must match `[a-zA-Z0-9._-]+`
- `--target <YYYY-MM-DD>` (optional) — target date for the milestone
- `--strategy <value>` (optional) — set the release strategy (default: `manual`). Options: `manual` (no git ops at ship time), `tag-only` (git tag + optional GH release), `release-please` (writes release-as to config)
- `--check <type>` (repeatable) — ship criteria check (e.g., `all_issues_closed`, `gates_pass`)
- `--confirm "<text>"` (repeatable) — ship criteria confirmation prompt (e.g., `"CHANGELOG updated"`)

**Behavior:**
1. Validate name and optional target date
2. Load existing milestones from `.context-index/milestones.json` via `lib/milestones.mjs` (creates file if absent)
3. If a milestone with the same name exists, update it idempotently (no new epic created)
4. If new, create a linked epic via `issueManager.createEpic({ title: name, milestone: name })`
5. Write milestone entry: `{ name, status: "planned", epic_id, target_date, ship_criteria }`
6. Report the created/updated milestone

**Implementation:** Call `milestoneCreate(projectRoot, name, options)` from `lib/milestones.mjs`. Pass the issue manager from `getIssueManager(manifest)`.

**Error cases:**

| Condition | Message | Code |
|-----------|---------|------|
| No name argument | Print usage hint | MISSING_NAME |
| Invalid name | "Invalid milestone name" | INVALID_NAME |
| Unparseable date | "Invalid date format. Use YYYY-MM-DD." | INVALID_DATE |
| No backend configured | Warn, still write YAML | NO_BACKEND |
| Epic creation fails | Write with `epic_id: null`, warn | EPIC_CREATE_FAILED |
| Unknown strategy | "Unknown release strategy" | UNKNOWN_STRATEGY |

### Milestone List

`milestone list`

Display all milestones with status, target date, linked epic, and issue progress.

**Behavior:**
1. Load milestones from `.context-index/milestones.json` via `lib/milestones.mjs`
2. For each milestone, query the issue manager for the linked epic and its child issues
3. Display a table: Name, Status, Target Date, Epic, Progress (open/total)
4. If a milestone's `epic_id` references a non-existent epic, show `epic-N (broken)` as a warning
5. If no milestones exist, display: "No milestones defined. Run `milestone create <name>` to create one."

**Implementation:** Call `milestoneList(projectRoot, options)` from `lib/milestones.mjs`. Pass the issue manager from `getIssueManager(manifest)`.

**Error cases:**

| Condition | Message | Code |
|-----------|---------|------|
| Malformed JSON | "milestones.json is malformed — cannot parse" | PARSE_ERROR |

### Milestone Ship

`milestone ship <name>`

Evaluate ship criteria, execute the configured release strategy, update status to `shipped`, and close the linked epic.

**Arguments:**
- `<name>` (required) — milestone name to ship

**Release strategies:**
- `manual` (default) — No git operations. Prints guidance for manual tag/publish.
- `tag-only` — Creates git tag (`v<name>` for semver). Optionally creates GitHub release draft via `gh` CLI.
- `release-please` — Writes `release-as` to `release-please-config.json`. Detects and prints open Release PR URL. Does not create tags.

Set the strategy with `milestone create --strategy <value>` or call `lib/milestones.mjs` writers directly (do not hand-edit `milestones.json`).

**Behavior:**
1. Validate name, load milestone from `milestones.json` via `lib/milestones.mjs`
2. If already shipped, report no-op and exit
3. Run `evaluateShipCriteria(milestone, issueManager, manifest)` — evaluates `all_issues_closed` and `gates_pass` auto-checks
4. If any auto-check fails, report failures and block ship
5. For each manual `confirm` criterion, prompt the user: "<text>? (yes/no)". If any rejected, block ship
6. Resolve release strategy via `resolveStrategy(milestone)` (defaults to `manual` when `release` is null)
7. Execute strategy-specific release mechanics (see Release strategies above)
8. Update milestone status to `shipped` in `milestones.json` via `lib/milestones.mjs`
9. Close linked epic via `issueManager.close(epicId, "Milestone shipped")`

**Implementation:** Call `milestoneShip(projectRoot, name, options)` from `lib/milestones.mjs`. Pass the issue manager from `getIssueManager(manifest)` and the parsed manifest. For interactive confirms, implement `confirmFn` that prompts the user in chat.

**Error cases:**

| Condition | Message | Code |
|-----------|---------|------|
| No name argument | Print usage hint | MISSING_NAME |
| Invalid name | "Invalid milestone name" | INVALID_NAME |
| Name not found | "Milestone '<name>' not found" | MILESTONE_NOT_FOUND |
| No valid epic | "No valid linked epic" | BROKEN_EPIC |
| Auto-check fails | Report failure detail, block | CRITERIA_FAILED |
| Confirm rejected | "Ship cancelled" | CONFIRM_REJECTED |
| Tag already exists (tag-only) | "Tag already exists" | TAG_EXISTS |
| Config not found (release-please) | Falls back to manual with warning | RELEASE_CONFIG_MISSING |
| Malformed config JSON (release-please) | "Not valid JSON — cannot write release-as" | RELEASE_CONFIG_INVALID |
| Unknown strategy value | "Unknown release strategy" | UNKNOWN_STRATEGY |
| Epic close fails | Warn, do not roll back | EPIC_CLOSE_FAILED |
| No test command | "No test command configured" | NO_TEST_COMMAND |

### Milestone Defer

`milestone defer <name> --reason "<text>"`

Set a milestone's status to `deferred` with a required reason.

**Arguments:**
- `<name>` (required) — milestone name to defer
- `--reason "<text>"` (required) — reason for deferral

**Behavior:**
1. Validate name and reason (both required)
2. Load milestone — reject if not found
3. Reject if milestone is already shipped (ALREADY_SHIPPED)
4. If already deferred, update the reason idempotently
5. Set status to `deferred`, save `defer_reason` to `milestones.json` via `lib/milestones.mjs`
6. If issue manager available, update linked epic status to `deferred`

**Implementation:** Call `milestoneDefer(projectRoot, name, reason, options)` from `lib/milestones.mjs`. Pass the issue manager from `getIssueManager(manifest)`.

**Error cases:**

| Condition | Message | Code |
|-----------|---------|------|
| No name argument | Print usage hint | MISSING_NAME |
| Invalid name | "Invalid milestone name" | INVALID_NAME |
| Name not found | "Milestone '<name>' not found" | MILESTONE_NOT_FOUND |
| No reason | "Reason is required" | MISSING_REASON |
| Milestone shipped | "Cannot defer a shipped milestone" | ALREADY_SHIPPED |
| Epic update fails | Warn, do not roll back | EPIC_UPDATE_FAILED |

## Key Principles

- **Read-modify-write.** Always read current state before modifying. Do not cache.
- **Backend agnostic.** Instructions work identically for json, file (legacy), and beads backends.
- **Graceful errors.** Report clear error messages for validation failures.
- **No lifecycle gating.** This skill is supporting — it does not gate the plan/implement/validate pipeline.
- **Worktree-safe.** Issue storage is automatically shared across git worktrees. The registry resolves the main repo root via git, or uses `tasks.db_path` from manifest if configured.

## API reference

Source modules (resolve `<ADEV_ROOT>` to the plugin root at runtime):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active issue adapter (json / file / beads).
- `IssueManagerInterface` (implemented by every adapter) — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.
- `renderTasksMd(board)` from `<ADEV_ROOT>/lib/issues/render-markdown.mjs` — pure renderer; takes `{ version, epics, issues }` and returns the canonical board markdown (the read-only consumer view).
- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`. Throws `INVALID_PROJECT_ROOT` if missing.
- `milestoneCreate` / `milestoneList` / `milestoneShip` / `milestoneDefer` from `<ADEV_ROOT>/lib/milestones.mjs` — milestone CRUD over `.context-index/milestones.json`.
