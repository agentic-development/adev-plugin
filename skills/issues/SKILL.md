---
name: adev:issues
description: "Manage project issues and epics. Create, update, close, and view issues across file-based or beads_rust backends. Use when the user says 'create an issue', 'file a bug', 'show issues', 'what needs to be done', 'create epic', 'issue board', or wants to manage work items directly."
---

# Issue Management

Manage project issues and epics using the configured task backend.

**Announce at start:** "I'm using the adev:issues skill to manage project issues."

## Arguments

- No arguments: display the full issue board
- `create "<title>" [--type bug|feature|task] [--epic <epic-id>] [--priority 0-4] [--spec-ref <path>] [--next-action <text>]`: create an issue
- `epic "<title>" [--milestone <name>]`: create a new epic in the epic store, optionally assigning it to a milestone
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

The active backend is whatever `tasks.backend` names in `.context-index/manifest.yaml`. The default is `json` (`.context-index/tasks/tasks.json`); `file` (legacy markdown, read-only) and `beads` are also supported.

Nothing has to be resolved here. Every `adev issues` sub-verb reads the manifest, selects the matching adapter, and resolves the storage root from the git common dir on its own — so one invocation is correct from the main checkout and from a linked worktree alike. The board storage is created on the first write, so there is no separate initialisation step to run.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill issues
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Board Display (no arguments)

Fetch and render the board in one step:

```bash
adev issues board [--milestone <name>]
```

This prints the whole board as canonical markdown on stdout. It is read-only — it never writes `tasks.md`; persisting the rendered board to a file is a separate operation the user has to ask for explicitly. Pass `--milestone <name>` to restrict the epics section to a single milestone.

Display that output to the user verbatim. **Persona adaptation:** the command emits the canonical board layout (epic groupings, milestone groupings, status sections). If a different persona is active, adapt the chat display to its output rules — but always source the board from this command; never hand-author table rows in skill responses.

Default ordering in the output:

1. **Open / In Progress** — active work (show first)
2. **Deferred** — parked items
3. **Closed** — completed (show last, collapsed if more than 10)

Standalone issues (no epic) appear under "Unassigned." When any epic has a `milestone` field set, epics are grouped by milestone name; epics without a milestone appear under "No Milestone" at the end.

### Create Issue

Create one board item in one step:

```bash
adev issues create "<title>" [--type <bug|feature|task>] [--priority 0-4] [--epic <epic-id>] [--spec-ref <path>] [--next-action <text>] [--notes <text>]
```

The command owns the defaults — type `task`, priority `2`, status `open` — so nothing here restates them per call. `--epic <id>` files the new issue under an existing epic; no id prefix is inspected anywhere, which keeps this correct on backends whose ids carry no prefix. Pass `--json` when you need the full created record rather than the summary line.

**Content template (BEH-1, BEH-2):** When `--type bug|feature` is given and no `--notes` was supplied, prompt the author before creating the issue:

> This is a `<bug|feature>` issue — give it a short body:
> **Problem / Intent:** what's wrong, or what capability is missing, and why it matters
> **Acceptance Criteria:** concrete, checkable outcomes
> **Out of Scope:** what this issue deliberately does not cover

Assemble the three answers into a single `notes` string and pass it via `--notes`. When `--type task` (the default) is given, skip this prompt — accept a one-line `--notes` value as-is, since Tasks are typically short and already scoped by a parent Feature's spec.

**Empty-body warning (BEH-4):** If the author skips or cancels the prompt above for a `feature`/`bug` issue, still create the issue (creation is never blocked) and report an additional line after the normal "Created ..." confirmation:

> Issue `<id>` was created without a body. Consider `/adev:issues update <id> --notes "..."` before work starts.

**Traceability (BEH-3):** When `--spec-ref <path>` is provided, or a `spec_ref` can be inferred from the active lifecycle context (e.g. invoked via `/adev:work` immediately after `/adev:specify`), pass it through with `--spec-ref`. `spec_ref` is a descriptive string, not filesystem-validated.

**Default `next_action` (BEH-6):** If `--next-action <text>` is not supplied for a newly created `feature` or `task` issue, look up a default from the next_action Convention Table in `skills/plan/epic-mode.md`, keyed on `type` and known state (e.g. a `feature` with no `spec_ref` yet gets `"Run /adev:specify --module <module> to author this Feature"`). Substitute real values for any `<token>` in the looked-up string. If no row matches, omit `--next-action` — this is not an error. An explicit `--next-action` value is always passed through verbatim and is never overridden by this lookup.

It prints the minted id in this shape, with one indented line per ref that was set:

> Created `<type>` `<id>`: <title>
> &nbsp;&nbsp;epic: `<epic-id>`
> &nbsp;&nbsp;spec: `<spec-ref>`

Display the command output to the user verbatim.

### Create Epic

Create one epic in one step:

```bash
adev issues epic "<title>" [--milestone <name>]
```

This is a different verb from `adev issues create`, not a synonym: an epic belongs in the epic store, which is the store `adev issues board`, `adev issues list --milestone` and `adev issues update --milestone` all read. `adev issues create --type epic` writes to the issue store instead, where none of them can see it — and it REFUSES `--milestone` (exit 1) rather than accepting a value it would drop. Relay that refusal and re-run it here.

Omitting `--milestone` creates an epic that carries none; one can be set later with `adev issues update <id> --milestone <name>`.

It prints:

> Created epic `<id>`: <title>
> &nbsp;&nbsp;milestone: <name>

with the second line present only when a milestone was set. Display the command output to the user verbatim.

### Update

Edit one board item in one step:

```bash
adev issues update <id> [--status <open|in_progress|deferred>] [--milestone <name>] [--title <text>] [--priority 0-4] [--notes <text>]
```

Pass only the id. The command resolves whether the id names an issue or an epic by looking it up on the board, so nothing here reads an id prefix — that keeps it correct on backends whose ids carry no prefix. `--status` and `--milestone` can be given together or independently; both land in a single call. `--milestone` applies to epics only (an issue carries none), and `--priority` to issues only — either on the wrong kind of item exits 1 with a message saying so.

`--status closed` is refused with exit 1: closing goes through `adev issues close`, which enforces the dependency guard. Relay the command's own redirect to the user rather than re-deriving it.

Display the command output to the user verbatim.

### Close

Close an item through the board's guards:

```bash
adev issues close <id> --reason "<text>"
```

`--reason` is required. Exit 2 means a guard refused the close and the board is unchanged — an open dependency, or an unclosed child of a tiered id. Every blocker is named on stderr, in this shape:

> Cannot close `<id>`: blocked by `<dep-id-1>`, `<dep-id-2>`. Close those first.

Relay that to the user; do not attempt a second close or work around the guard. Exit 1 is a usage error or an adapter failure — an unknown id is an exit 1, not a refusal.

### List (filtered)

Fetch and render the filtered list in one step:

```bash
adev issues list [--status <s>] [--epic <id>] [--milestone <name>]
```

This prints a table of matching issues on stdout, sorted by priority ascending (0 first). `--milestone <name>` restricts the result to epics carrying that milestone and their child issues; when no epic carries it, the command prints `No epics found for milestone '<name>'.` instead of an empty table.

Display that output to the user verbatim.

### Add Dependency

Record that one issue is blocked by another:

```bash
adev issues dep <issue-id> <depends-on-id>
```

Exit 2 means the dependency would close a cycle (direct or transitive); the command reports the cycle it found and writes nothing. Relay that report to the user. Recording a dependency that already exists is a no-op success.

Display the command output to the user verbatim.

### Ready

```bash
adev issues ready
```

This prints the issues that can be picked up right now, under the heading `Actionable issues — open and unblocked.`, sorted by priority ascending.

Display that output to the user verbatim.

### Milestone Create

```bash
adev issues milestone create <name> [--target <YYYY-MM-DD>] [--strategy <manual|tag-only|release-please>] [--check <type>]... [--confirm "<text>"]...
```

Creates the milestone and links a fresh epic to it. Re-running with an existing name updates that milestone in place and creates no second epic, so it is safe to repeat.

**Arguments:**
- `<name>` (required) — milestone name, must match `[a-zA-Z0-9._-]+`
- `--target <YYYY-MM-DD>` (optional) — target date for the milestone
- `--strategy <value>` (optional) — release strategy (default: `manual`). Options: `manual` (no git ops at ship time), `tag-only` (git tag + optional GH release), `release-please` (writes release-as to config)
- `--check <type>` (repeatable) — auto-checked ship criterion (e.g., `all_issues_closed`, `gates_pass`)
- `--confirm "<text>"` (repeatable) — manual ship criterion (e.g., `"CHANGELOG updated"`)

**Behavior:**
1. Validates the name and the optional target date
2. Creates the milestones store if it does not exist yet
3. Updates an existing milestone of the same name idempotently — no second epic
4. Links a new epic named after the milestone when the milestone is new
5. Records `{ name, status: "planned", epic_id, target_date, ship_criteria }`
6. Prints the created or updated milestone

Display the command output to the user verbatim.

**Error cases** (exit 1 unless noted):

| Condition | Message | Code |
|-----------|---------|------|
| No name argument | Print usage hint | MISSING_NAME |
| Invalid name | "Invalid milestone name" | INVALID_NAME |
| Unparseable date | "Invalid date format. Use YYYY-MM-DD." | INVALID_DATE |
| No backend configured | Warn, still write the entry | NO_BACKEND |
| Epic creation fails | Write with `epic_id: null`, warn | EPIC_CREATE_FAILED |
| Unknown strategy | "Unknown release strategy" | UNKNOWN_STRATEGY |

### Milestone List

```bash
adev issues milestone list
```

Prints every milestone as a Name / Status / Target Date / Epic / Progress table. Progress counts open versus total issues on the linked epic; an `epic_id` that no longer exists on the board is shown as `<id> (broken)`. When nothing is defined it prints `No milestones defined.` instead of an empty table.

Display that output to the user verbatim.

**Error cases:**

| Condition | Message | Code |
|-----------|---------|------|
| Malformed store | "milestones.json is malformed — cannot parse" | PARSE_ERROR |

### Milestone Ship

```bash
adev issues milestone ship <name> [--yes] [--gate-timeout <ms>]
```

Evaluates the milestone's ship criteria and, if they all pass, marks it shipped, closes its epic, and performs the release action its strategy names.

**Arguments:**
- `<name>` (required) — milestone name to ship
- `--yes` (optional) — answer every manual confirmation with yes
- `--gate-timeout <ms>` (optional) — per-gate wall-clock budget (default 300000)

**Release strategies:**
- `manual` (default) — no git operations; prints guidance for a manual tag or publish
- `tag-only` — creates the git tag (`v<name>` for semver), optionally a GitHub release draft via `gh`
- `release-please` — writes `release-as` into `release-please-config.json` and prints the open Release PR URL; creates no tag

Set the strategy at creation time with `--strategy`; never hand-edit the milestones store.

**The confirmation protocol is the load-bearing part.** Exit 2 means the ship was REFUSED and **nothing was written** — an auto-check failed, a quality gate failed or timed out, or a manual confirmation is unanswered. Without `--yes` every manual confirmation counts as unanswered, so the command lists the pending items and refuses. Relay that list to the user, ask them in chat, and re-invoke with `--yes` once they have confirmed. Never bypass a refusal by editing the store or by reaching past the command.

Exit 1 is a usage error or a lib failure (`MILESTONE_NOT_FOUND`, `BROKEN_EPIC`, `UNKNOWN_STRATEGY`, …). Exit 0 means the milestone shipped; the output names the strategy and the epic that was closed.

**Error cases:**

| Condition | Message | Code | Exit |
|-----------|---------|------|------|
| No name argument | Print usage hint | MISSING_NAME | 1 |
| Invalid name | "Invalid milestone name" | INVALID_NAME | 1 |
| Name not found | "Milestone '<name>' not found" | MILESTONE_NOT_FOUND | 1 |
| No valid epic | "No valid linked epic" | BROKEN_EPIC | 1 |
| Auto-check fails | Report the failure detail, block | CRITERIA_FAILED | 2 |
| Quality gate times out | Name the gate and its budget, block | CRITERIA_FAILED | 2 |
| Confirm unanswered or rejected | Name the pending confirm, block | CONFIRM_REJECTED | 2 |
| Tag already exists (tag-only) | "Tag already exists" | TAG_EXISTS | 2 |
| Config not found (release-please) | Falls back to manual with a warning | RELEASE_CONFIG_MISSING | 0 |
| Malformed config JSON (release-please) | "Not valid JSON — cannot write release-as" | RELEASE_CONFIG_INVALID | 1 |
| Unknown strategy value | "Unknown release strategy" | UNKNOWN_STRATEGY | 1 |
| Epic close fails | Warn, do not roll back | EPIC_CLOSE_FAILED | 0 |

### Milestone Defer

```bash
adev issues milestone defer <name> --reason "<text>"
```

Marks a milestone deferred, records why, and defers its linked epic. `--reason` is required. Deferring an already-deferred milestone updates the reason idempotently; a shipped milestone cannot be deferred.

Display the command output to the user verbatim.

**Error cases** (exit 1):

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
- **Worktree-safe.** Issue storage is automatically shared across git worktrees. The verbs resolve the main repo root via git, or use `tasks.db_path` from manifest if configured.
- **Never call the backend binary (`br create`, …) directly.** `br` resolves `.beads/` from the current directory, so inside a linked worktree it opens the git-tracked `issues.jsonl` with no `beads.db` beside it and fails with `SYNC_CONFLICT` — the write is silently lost. Every board operation goes through `adev issues <sub>`, which resolves the storage root from the git common dir.

## API reference

**Descriptive only — do not call these directly.** This section documents what the `adev issues` verbs wrap internally, so the mapping from verb to source module is discoverable. It is not a set of instructions: every step above is performed by invoking the verb, never by importing or calling these functions.

Source modules (resolve `<ADEV_ROOT>` to the plugin root at runtime):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active issue adapter (json / file / beads).
- `IssueManagerInterface` (implemented by every adapter) — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.
- `renderTasksMd(board)` from `<ADEV_ROOT>/lib/issues/render-markdown.mjs` — pure renderer; takes `{ version, epics, issues }` and returns the canonical board markdown (the read-only consumer view).
- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`. Throws `INVALID_PROJECT_ROOT` if missing.
- `milestoneCreate` / `milestoneList` / `milestoneShip` / `milestoneDefer` from `<ADEV_ROOT>/lib/milestones.mjs` — milestone CRUD over `.context-index/milestones.json`.
