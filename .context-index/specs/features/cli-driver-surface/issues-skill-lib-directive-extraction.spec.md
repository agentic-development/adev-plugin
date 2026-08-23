---
charter: cli-driver-surface
kind: refactor
mode: refactor
status: validated
risk_level: low
milestone: adev-compiler-discipline
revision: 4
charter-revision: 4
created: 2026-08-19
updated: 2026-08-20
source-manifest:
  sha: "90e6843"
  files:
    - cli/index.mjs
    - docs/cli-reference.md
    - lib/cli/issues-board.mjs
    - lib/cli/issues-create.mjs
    - lib/cli/issues-epic.mjs
    - lib/cli/issues-list.mjs
    - lib/cli/issues-milestone.mjs
    - lib/cli/issues-mutate.mjs
    - lib/cli/issues.mjs
    - skills/implement/SKILL.md
    - skills/issues/SKILL.md
    - skills/plan/SKILL.md
    - skills/reconcile/SKILL.md
    - tests/cli/issues-board.test.mjs
    - tests/cli/issues-epic.test.mjs
    - tests/cli/issues-help-routing.test.mjs
    - tests/cli/issues-list.test.mjs
    - tests/cli/issues-milestone.test.mjs
    - tests/cli/issues-mutate.test.mjs
    - tests/cli/issues-worktree-storage.test.mjs
    - tests/issues/cli-create.test.mjs
    - tests/skills/epic-creation-verb-coverage.test.mjs
    - tests/skills/issues-skill-verb-coverage.test.mjs
  computed-at: "2026-08-20T03:07:08.408Z"
---

# Refactoring Spec: /adev:issues Lib-Directive Extraction

<!-- Refactoring spec within the cli-driver-surface charter.

     Charter relationship: the charter's "Inline-Node extraction sweep" capability is
     marked `implemented`, and its In-Scope text covers "every ... embedded JS code fence
     in the 18 canonical skills/*/SKILL.md files". skills/issues/SKILL.md still carries one
     such fence (lines 49-63), so that capability has a residual gap. The remaining sites in
     this spec are PROSE directives ("Call `createEpic({...})` on the adapter"), which no
     existing capability row names. Revisions 1-2 carried `charter-extension: true` to record
     that divergence rather than silently widen a completed capability. RESOLVED at charter
     rev 4 (2026-08-20): the charter now carries a "Lib-directive extraction (prose-level)"
     row at status `validated`, so the flag has been removed and `charter-revision` bumped
     3 -> 4. The row was added only after the operator asked for it — two agents in the build
     pipeline correctly declined to invent one.

     Second divergence recorded here (review finding CON-1): Migration Path Step 5 and the
     matching acceptance criterion regenerate the provider mirrors, which the charter lists
     under Out of Scope ("Provider mirror sync ... remains hand-maintained until a dedicated
     provider-mirror-sync charter"). RESOLVED at charter rev 4: that entry was factually stale —
     scripts/sync-provider-skills.mjs generates the mirrors and tests/sync/provider-skill-parity.test.mjs
     fails the suite when they drift (verified 2026-08-20: 138 mirrors, 0 drift). The entry now
     states that regenerating mirrors is in scope and mandatory, while hand-editing providers/**
     stays out of scope.

     Distinct from lib-import-control-flow-extraction.spec.md (review-passed, unplanned),
     which covers three control-flow blocks in plan/implement SKILL.md. No site overlap. -->

## Current State

### Structure

| File | Role | Lines | Notes |
|---|---|---|---|
| `skills/issues/SKILL.md` | The `/adev:issues` skill — board display, issue/epic CRUD, dependencies, ready list, milestone lifecycle | 265 | 16 directive sites naming lib functions; 1 embedded JS fence |
| `lib/cli/issues.mjs` | Parent sub-verb dispatcher | ~90 | Exposes `create`, `migrate`, `claim`, `release`, `stale` |
| `lib/cli/issues-create.mjs` | `adev issues create` — the first extracted verb | ~140 | Landed 2026-08-19; covers issue and epic creation |
| `lib/issues/registry.mjs` | `getIssueManager(manifest, projectRoot)` — resolves backend + storage root | — | Already worktree-correct via `resolveStorageRoot()` |
| `lib/issues/render-markdown.mjs` | `renderTasksMd(board)` pure renderer; `writeTasksMd(root)` file writer | — | `writeTasksMd` is reachable as `adev status --render`; `renderTasksMd` has no verb |
| `lib/milestones.mjs` | `milestoneCreate` / `milestoneList` / `milestoneShip` / `milestoneDefer` | — | No verb; `milestoneShip` takes a `confirmFn` callback |

### Problems

**P1 — Directives with no CLI surface.** 16 sites in `skills/issues/SKILL.md` instruct the agent to call a lib function directly, with no `adev <verb>` behind any of them:

| Site (line) | Directive | Step |
|---|---|---|
| 49-63 | fenced JS: `getIssueManager` + `listEpics` + `list` + `renderTasksMd` | Board Display |
| 77 | `create()` | Create Issue |
| 85 | `createEpic({ title, milestone })` | Create Epic |
| 92-93 | `update(id, {status})` / `updateEpic(id, {status})` | Update |
| 99 | `close(id, reason)` | Close |
| 105 | `list(filters)` | List |
| 111 | `addDependency(issueId, dependsOnId)` | Add Dependency |
| 115 | `list({status:"open"})` + client-side unblocked filter | Ready |
| 134 | `issueManager.createEpic({ title, milestone })` | Milestone Create |
| 138, 164, 199, 236 | `milestoneCreate` / `List` / `Ship` / `Defer` from `lib/milestones.mjs` | Milestone lifecycle |
| 33 | `loadManifest` + `getIssueManager` | Backend Resolution |

This violates the constitutional rule the charter exists to enforce: *"Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive ... If a fenced JavaScript block contains control-flow logic, that logic belongs inside the CLI verb's implementation."* Line 115 is the clearest case — "filter out issues whose dependencies include any unclosed issues" is an algorithm written in prose for the agent to re-implement per invocation.

**P2 — The failure P1 actually causes is a data-loss failure, not a style failure.** Observed 2026-08-19: a `/adev:plan` subagent needed to create an epic, found no verb to call, and improvised `br create`. Raw `br` resolves `.beads/` from the current directory. `git worktree add` materialises the git-tracked `.beads/issues.jsonl` into every linked worktree while the gitignored `beads.db` stays in the main checkout, so `br` opened a JSONL with no database beside it and exited:

```
Error: Sync conflict: Refusing storage open because pending sync-merge state
could not be inspected ... the authorized database is missing
```

The epic was never created; 11 planned tasks existed only in the lifecycle log. Reproduced in 9 of 10 worktrees in this repo (every one carrying `.beads/issues.jsonl` with no `beads.db`). The main board is healthy — `br doctor` passes, 540 records in sync — so no amount of board repair prevents a recurrence. **The board was never broken; the skill had nowhere to send the agent.**

**P3 — The correct path already exists and is unreachable from prose.** `getIssueManager()` resolves the storage root through `resolveStorageRoot()` (git common dir), and `BeadsAdapter` passes both `--db <main-repo>/.beads/beads.db` and `cwd: projectRoot`. Verified from inside a worktree: `storageRoot` and `db target` both resolve to the main checkout, and a read returns all 420 issues. Every improvised backend-binary call bypasses this.

**P4 — Board rendering has a verb for the wrong half.** `adev status --render` calls `writeTasksMd()` and writes `.context-index/tasks/tasks.md` to disk. The skill's Board Display step needs `renderTasksMd()` — the pure renderer whose output goes to the user in chat. No verb exposes it, so the skill inlines the composition (`listEpics` + `list` + render) as fenced JS.

### Dependencies

- `lib/issues/interface.mjs::validateIssue` — field validation and the `notes`/`description`/`body` aliases; verbs must not duplicate its defaults.
- `lib/issues/registry.mjs::getIssueManager` — the single resolution point for backend + storage root. Every verb goes through it; none may open storage by path.
- `JsonAdapter::_validateBoardGranularity` — rejects `planTask` on board items with `BOARD_GRANULARITY_VIOLATION`. No verb may expose a `--plan-task` flag.
- `cli/index.mjs` dispatch — `mod.dispatchesSubcommandHelp` opt-out (landed 2026-08-19) is what lets `adev issues <sub> --help` reach a sub-verb's own help.
- `tests/skills-extension-coverage.test.mjs` — the skill's Load Skill Extensions block must survive the rewrite.
- Provider mirrors (`providers/*/skills/`) — regenerated by `scripts/sync-provider-skills.mjs`; parity is test-enforced.

## Target State

### Structure

| File | Role | Change |
|---|---|---|
| `lib/cli/issues.mjs` | Sub-verb dispatcher | MODIFIED — routes 8 more sub-verbs |
| `lib/cli/issues-create.mjs` | `create` | MODIFIED — gains `--epic`, `--milestone` |
| `lib/cli/issues-board.mjs` | `board` — render the canonical board to stdout | ADDED |
| `lib/cli/issues-list.mjs` | `list`, `ready` — filtered and actionable views | ADDED |
| `lib/cli/issues-epic.mjs` | `epic` — create in the EPIC store | ADDED (rev 3: not foreseen at rev 2 — see the epic-store note below) |
| `lib/cli/issues-mutate.mjs` | `update`, `close`, `dep` — the three board writes | ADDED |
| `lib/cli/issues-milestone.mjs` | `milestone create\|list\|ship\|defer` | ADDED |
| `skills/issues/SKILL.md` | The skill | MODIFIED — every step names a verb |

Grouping rationale: `update`/`close`/`dep` share argument shapes and the adapter-error vocabulary, and `list`/`ready` share filter parsing — splitting them into six files would duplicate both. `board` and `milestone` stand alone (distinct output contracts, distinct lib backing).

### Improvements

| Problem | Resolution |
|---|---|
| P1 | Every directive site names `adev issues <sub>`. The Ready filter algorithm moves from prose into `issues-list.mjs`. |
| P2 | The agent has a verb for every step, so it has no reason to reach for `br`. The skill states the prohibition explicitly, as `plan`/`implement`/`reconcile` now do. |
| P3 | Every verb routes through `getIssueManager()`, inheriting `resolveStorageRoot()`. Worktree-correct by construction. |
| P4 | `adev issues board` exposes `renderTasksMd()` for chat display, distinct from `adev status --render`, which keeps writing `tasks.md` to disk. |

## Changes Catalog

### ADDED

- `adev issues board [--milestone <name>] [--json]` — fetches epics + issues via the adapter, renders through `renderTasksMd()`, prints to stdout. `--json` emits `{ version, epics, issues }` unrendered.
- `adev issues list [--status <s>] [--epic <id>] [--milestone <name>] [--json]` — filtered list, sorted by priority. No `--type` filter.
- `adev issues ready [--json]` — open issues with no unclosed blocker. The filter lives in the verb.
- `adev issues epic <title> [--plan-ref <path>] [--milestone <name>] [--json]` — creates in the **epic store**. **Not foreseen at rev 2**, which assumed `create --type epic` would serve. It does not: see the epic-store note below.
- `adev issues update <id> [--status <s>] [--milestone <name>] [--title <text>] [--priority <0-4>] [--notes <text>]` — resolves the item by id (issue or epic) and dispatches to `update()` or `updateEpic()`; the caller never branches on id prefix. `--status closed` is refused with a pointer to `close`. `--milestone` on an issue and `--priority` on an epic are usage errors.
- `adev issues close <id> --reason <text>` — exits `2` when blocked by unclosed dependencies or the cascade guard (a refusal, distinct from exit `1` usage/adapter errors), listing the blockers.
- `adev issues dep <id> <depends-on-id>` — exits `2` on a cycle, naming it.
- `adev issues milestone create <name> [--target <YYYY-MM-DD>] [--strategy <manual|tag-only|release-please>] [--check <type>]... [--confirm "<text>"]...`
- `adev issues milestone list`
- `adev issues milestone ship <name> [--yes] [--gate-timeout <ms>]` — the verb always supplies a `confirmFn`; `--yes` makes it accept, its absence makes it reject, so the verb prints the confirmation set and exits `2` without shipping and the skill can ask the user in chat and re-invoke. `lib/milestones.mjs` is NOT modified — see BEH-7 for why the callback must be present in both cases. `--gate-timeout` was added during implementation so the verb can name the budget it passed; see the note below.
- `adev issues create <title> [--type <t>] [--priority <0-4>] [--epic <id>] [--plan-ref <path>] [--spec-ref <path>] [--parent <id>] [--notes <text>] [--next-action <text>] [--id <id>] [--json]` — gained `--epic` and `--plan-ref`. It does **not** accept `--milestone`: that flag exits `1` pointing at `adev issues epic`, because milestone is an epic-level field an issue would silently drop.

**Rev 3 reconciliation — `--json` is narrower than rev 2 promised.** Only `board`, `list`, `ready`, `epic` and `create` ship `--json`. `update`, `close`, `dep` and all four `milestone` sub-verbs are human-output only. Rev 2 listed `[--json]` on every verb; that was aspirational, not built. Recorded rather than back-filled: adding `--json` to the mutating verbs is a follow-up, and `issue-l1efc1` (`--json` truncates at 64 KiB when piped) should land first, since widening the `--json` surface widens that bug's blast radius.

**Rev 3 reconciliation — the epic store.** Rev 2's Changes Catalog said `create` would gain `--epic <id>` and `--milestone <name>` and that `create --type epic` would mint plan epics. Task 4 found this is false on `JsonAdapter`, the default backend: `create()` pushes to `board.issues`, only `createEpic()` writes `board.epics`, and `listEpics()` reads `board.epics` alone. An epic minted via `create --type epic` is therefore invisible to every epic lookup, so `/adev:implement`'s "load the epic for this plan" would miss it and mint a duplicate on every run. A dedicated `adev issues epic` verb was added instead, `create --milestone` became an explicit refusal, and commit `a0952b9c` repaired the three skills that had already been told to use `create --type epic`. The same two-store split is the root cause of `issue-1vwwea`.

### MODIFIED

- `skills/issues/SKILL.md` — all 16 directive sites replaced by verb invocations; the fenced JS block at 49-63 deleted; the API reference section retained as descriptive documentation of what the verbs wrap.
- `lib/cli/issues.mjs` — dispatch table and `help()` extended; exports `dispatchesSubcommandHelp = true`.
- `lib/cli/issues-create.mjs` — gained `--epic`, `--plan-ref`, and the `--milestone` refusal.
- `cli/index.mjs` — the blanket `--help` short-circuit now honours `dispatchesSubcommandHelp`, so `adev issues <sub> --help` reaches the sub-verb's own help instead of printing the parent's subcommand list (BEH-8).
- `docs/cli-reference.md` — §issues documents all 13 sub-verbs, with a uniform exit-code table. Incidentally repaired merge-conflict markers at lines 716-788 that merge `e59ef658` had committed into this file before this spec existed.
- `providers/{codex,opencode}/skills/issues/SKILL.md` — regenerated by `scripts/sync-provider-skills.mjs`; see the header note on the charter's stale Out-of-Scope entry.

### REMOVED

- The fenced JavaScript block at `skills/issues/SKILL.md:49-63`. Removal is safe because the composition it describes (`listEpics` + `list` + `renderTasksMd`) becomes `adev issues board`, which produces byte-identical markdown.
- The prose Ready algorithm at line 115. Superseded by `adev issues ready`.

### RENAMED

None.

## Migration Path

Per-step atomic, following the charter's per-skill invariant: no step leaves a SKILL.md section carrying both a lib directive and a verb invocation.

### Step 1: Read-only verbs — `board`, `list`, `ready`

Add `lib/cli/issues-board.mjs` and `lib/cli/issues-list.mjs`; rewrite the Board Display, List and Ready sections of the skill in the same commit.
**Risk:** Low — no writes; a wrong answer is visible immediately.
**Verify:** New tests assert the rendered board is byte-identical to `renderTasksMd()` over the same board, and that `ready` excludes an issue with an open blocker and includes it once the blocker closes.

### Step 2: Mutating verbs — `update`, `close`, `dep`

Add `lib/cli/issues-mutate.mjs`; rewrite the Update, Close and Add Dependency sections.
**Risk:** Medium — these write to the board. The close-guard and cycle-guard refusals must keep their current semantics.
**Verify:** Tests assert exit `2` + blocker list on a guarded close, exit `2` + cycle report on a cyclic dep, and that `update` reaches an epic and an issue without the caller branching on id prefix.

### Step 3: Create flags — `--epic`, `--milestone`

Extend `issues-create.mjs`; rewrite the Create Issue and Create Epic sections.
**Risk:** Low — additive flags on a verb already under test.
**Verify:** Epic created with `--milestone` carries it; existing create tests unchanged.

### Step 4: Milestone lifecycle

Add `lib/cli/issues-milestone.mjs`; rewrite the four Milestone sections.
**Risk:** Medium — `milestoneShip` mutates release config (`release-please-config.json` under the `release-please` strategy) and is the one verb with an interactive confirmation contract.
**Verify:** Tests assert `ship` without `--yes` exits `2` and mutates nothing; with `--yes` it proceeds. `create`/`list`/`defer` round-trip through `.context-index/milestones.json`.

### Step 5: Sweep and enforce

Regenerate provider mirrors; confirm no `getIssueManager`/`createEpic`/`milestone*` directive remains outside the descriptive API-reference section.
**Risk:** Low.
**Verify:** Full suite green; `hooks/pre-commit-no-inline-node.sh` passes; provider-parity test passes.

## Invariants

- **INV-1** — All existing tests pass at every step, without modification.
- **INV-2** — Board data is read and written only through `getIssueManager()`. No verb opens `.beads/`, `tasks.json`, or `milestones.json` by path.
- **INV-3** — No SKILL.md section carries both a lib directive and a verb invocation for the same step (charter per-step boundary; enforced by `hooks/pre-commit-no-inline-node.sh`).
- **INV-4** — No verb exposes `--plan-task`. Plan-task state stays in the lifecycle log.
- **INV-5** — Refusals keep their exit codes: `2` = refused by a guard (close-blocked, cycle, unconfirmed ship), `1` = usage error or adapter failure, `0` = success.
- **INV-6** — `adev status --render` keeps writing `tasks.md`. `adev issues board` never writes to disk.
- **INV-7** — The skill's Load Skill Extensions block survives every rewrite.

## Behavioral Contract

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** any `adev issues` sub-verb runs from a linked git worktree **then** it reads and writes the main checkout's board, resolved via `resolveStorageRoot()`.
- **BEH-2** — **When** `adev issues board` runs **then** it prints the canonical rendered board to stdout and writes nothing to disk.
- **BEH-3** — **When** `adev issues ready` runs **then** it lists exactly the open issues whose every dependency is closed.
- **BEH-4** — **When** `adev issues close <id>` targets an issue with unclosed dependencies **then** it refuses with exit `2` and names each blocking id.
- **BEH-5** — **When** `adev issues dep` would create a cycle **then** it refuses with exit `2` and reports the cycle.
- **BEH-6** — **When** `adev issues update <id>` is given an epic id **then** it updates the epic, and given an issue id it updates the issue, without the caller declaring which.
- **BEH-7** — **When** `adev issues milestone ship <name>` runs without `--yes` **then** it prints the pending confirmations, exits `2`, and mutates no file. **Mechanism (load-bearing):** the verb ALWAYS passes a `confirmFn` to `milestoneShip` — one that returns `false` without `--yes` and `true` with it. Omitting `confirmFn` is NOT the mechanism: `lib/milestones.mjs:921` guards the confirm loop with `confirms.length > 0 && options.confirmFn`, so a missing callback skips every manual confirmation and ships. The refusal must be an explicit rejection, not an absent callback.
- **BEH-8** — **When** a sub-verb is invoked with `--help` **then** it prints that sub-verb's own usage, not the parent's subcommand list.
- **BEH-9** — **When** `skills/issues/SKILL.md` is read after this refactor **then** every executable step names an `adev issues <sub>` invocation, and lib-function names appear only in the descriptive API-reference section.

### Error Cases

| Condition | Expected behavior | Exit |
|---|---|---|
| Missing required positional (id, title, name) | Usage line naming the verb | 1 |
| Unknown sub-verb | Parent help + `unknown issues subcommand: <s>` | 1 |
| `--priority` outside 0-4 | `invalid --priority: <v>. Valid: 0-4` | 1 |
| Close blocked by unclosed dependencies | Names each blocker | 2 |
| Dependency would create a cycle | Reports the cycle | 2 |
| `milestone ship` without `--yes` | Prints confirmations, mutates nothing | 2 |
| `milestone ship` with failing auto-check criteria | Names each failed check; `shipped: false`; mutates nothing | 2 |
| `milestone ship` gate evaluation times out | Reports the timed-out gate and its budget; mutates nothing | 2 |
| `milestone ship` confirmation rejected by the operator | Names the rejected confirm (`confirmRejected`); mutates nothing | 2 |
| Adapter throws (`BEADS_NOT_AVAILABLE`, `UNKNOWN_BACKEND`, …) | `<CODE>: <message>` on stderr | 1 |
| Issue id not found | `<id> not found` | 1 |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because every new verb uses `node:util`'s `parseArgs` and the existing adapter layer; no dependency is added.
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required for the skill to function" — Applies with a boundary: the verbs must not become the only way to understand the step. Each rewritten section keeps prose describing what the step does; the verb is how it is done.
- **Principle (Anti-Pattern):** "Fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive" — This spec exists to close the last violation of it in `skills/issues/SKILL.md`.
- **Principle:** "No hardcoded paths — use plugin root resolution" — Applies via INV-2: storage location is resolved, never assumed.

## Acceptance Criteria

- [ ] All current tests pass without modification (INV-1)
- [ ] Every one of the 16 directive sites in `skills/issues/SKILL.md` names a verb, or is in the descriptive API-reference section
- [ ] The fenced JavaScript block at lines 49-63 is gone
- [ ] Each new verb has tests covering its success path, its refusal path, and its exit code
- [ ] At least one test creates or mutates the board from a linked worktree and asserts the main checkout's board changed (BEH-1)
- [ ] `adev issues <sub> --help` prints the sub-verb's usage for every sub-verb (BEH-8)
- [ ] `docs/cli-reference.md` documents every new sub-verb
- [ ] Provider mirrors regenerated; parity test passes
- [ ] `hooks/pre-commit-no-inline-node.sh` passes
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
