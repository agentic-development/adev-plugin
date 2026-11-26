---
kind: feature
status: approved
revision: 10
updated: 2026-11-25
tracker-ref: agentic-development/adev-plugin#441
---

# Feature Charter: Task Management

## Business Intent

The task-management module provides persistent, cross-skill issue tracking for the adev lifecycle. It replaces the ephemeral `TodoWrite` mechanism with a pluggable layer that persists work-item state in the repository, supports an **adaptable tiered hierarchy (Epic → Feature → Task by default, with arbitrary depth via dotted IDs)**, and integrates with both a zero-setup file backend and the beads_rust CLI for scaling. Each work item carries a free-text **`next_action`** field that documents the next agent step (typically a skill invocation), reducing drift in long agent sessions. Skills create, claim, update, and close items programmatically via `lib/issues/`; users manage the board through `/adev:issues`.

The beads backend's board data is git-tracked on a dedicated orphan branch (`beads-board`), checked out as a linked worktree at `.beads/` rather than living in `main`'s history — so bots and CI can push board updates directly without a PR or a branch-protection exception, while `main`'s commit log stays free of board churn. The board remains public and git-tracked by design (portability is the point); "no secrets in issue bodies" is a documented norm, not a technical gate.

A fourth backend, **`github`**, makes a GitHub Projects v2 board (with issues in one or more repositories) *the* issue board, so teams that run their process on GitHub keep one board for people and agents instead of two. Unlike the GitHub Issues bridge owned by `autonomous-bugfix-loop`, nothing is copied: skills read and write GitHub directly through the unchanged `IssueManager` contract. Plan-task state in the lifecycle log stays in the repository, preserving the board-granularity invariant.

### Storage Format Authority

This charter retains ownership of *what* the issue board means: lifecycle, tiered IDs, `next_action`, dependency edges, and the `IssueManagerInterface` contract. *How* issue-board state is persisted on disk — `.context-index/tasks/tasks.json` schema, atomic temp-rename writes, CAS over a `seq` field, the `JsonAdapter` registration, and the board-granularity invariant (no `planRef`+`planTask` on the same issue) — is owned by the `agent-reliable-state-artifacts` charter. See `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`.

## Scope and Boundaries

### In Scope

- **Adaptable tiered hierarchy** with Epic → Feature → Task as the recommended default, supporting 2-tier or 4+-tier shapes via dotted IDs
- **Dotted ID format** (`e1`, `e1.f1`, `e1.f1.t1`) with lowercase prefixes and per-parent monotonic counters
- **Manifest-configurable tier prefixes** via `tasks.tier_prefixes` (override default `e/f/t` if a project prefers other conventions)
- **Free-text `next_action`** field on every work item, updated by skills on state transitions
- **Free-text `type`** field with default `"task"` (replaces strict bug/feature/task enum)
- **Unified `create()` API** accepting tier inferred from `parent_id`, replacing separate `createEpic`/`createIssue` methods
- **Tree walking** via `walkTree(parentId)` using ID prefix match
- **Backward compatibility** with legacy flat IDs (`epic-N`, `issue-N`, `bd-XXXXXX`) — coexist indefinitely with tiered IDs
- File-based backend storing all work items in a single `tasks.md` markdown table
- beads_rust backend wrapping the `br` CLI; tiered hierarchy stored as `parent_id` metadata (not encoded in beads IDs)
- Adapter registry with manifest-driven backend selection and detection
- Work item CRUD via `lib/issues/` for programmatic use by skills
- `/adev:issues` skill for user-facing management, ad-hoc creation, and board viewing
- Integration into `/adev:plan` (creates Features and Tasks at appropriate tiers from plan files)
- Integration into `/adev:implement` (claims Tasks on start, closes on completion, updates `next_action`)
- Integration into `/adev:validate` (records pass/fail outcome and updates `next_action`)
- Integration into `/adev:specify` (creates a Feature work item bound to the Live Spec it just authored, 1:1)
- Constitution template section documenting task management
- Sync block emitted by `/adev:sync` into agent files
- **GitHub Issues bridge scope carve-out**: this charter permits bidirectional sync between the local issue board and GitHub Issues to exist — it does not implement it. Implementation (adapter interface, sync mechanics, field mapping, credentials) is owned by `autonomous-bugfix-loop/charter.md`, which this scope was carved out for. Carved out of the External Tracker Sync exclusion below by revision 7 (2026-08-19) — see Migration Notes.
- **Orphan `beads-board` branch** as the git home for `.beads/` board data (`issues.jsonl`, `config.yaml`), decoupled from `main`'s history.
- **`.beads/` as a linked git worktree** attached to `beads-board`, composing with `resolveStorageRoot()`'s existing worktree-sharing logic — every local worktree of the same clone still resolves to one physical board, unchanged. Unrelated to `worktree-parallelization/charter.md`'s worktrees: that module's are ephemeral, task-execution-scoped, and merge back; `.beads/` is one permanent, never-merged infrastructure worktree.
- **One-command fresh-clone bootstrap**: `git worktree add .beads beads-board` (validated live — a plain `git clone` already fetches the ref, no separate `git fetch` needed).
- **`main`'s `.gitignore`** gains a `.beads/` entry so the linked worktree doesn't show as untracked noise on `main`.
- **Direct push to `beads-board`** — CI/bots and interactive sessions alike, no PR, no branch-protection exception, since nothing ever merges into `main`.
- **CLI install/bootstrap flow** (`cli/index.mjs`) provisions the linked worktree for new installs. Scoped to project-local `.beads/` provisioning only — this does not change the adev-plugin CLI's own installation path structure (`~/.claude/` layout, plugin registration), so it does not trip that constitutional Requires-Human-Approval boundary.
- **One-time migration** for this repo's existing `main`-tracked `.beads/issues.jsonl` onto the new topology.
- **GitHub board backend** (`tasks.backend: github`, revision 10): GitHub Issues + Projects v2 as the board itself, configured via `tasks.github.{project, repo, status_field, status_map, priority_field}` plus a type source, accessed through the `gh` CLI or the token it provides — the same posture as beads shelling out to `br`.
- **Field placement and write authority** on the github backend. Every adev field that agents act on lives where only project or repository maintainers can write it, never in text the issue author controls:
  - **Project v2 fields** (editable only by project writers): Status, Priority, `owner`, `claimed_at`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, and `legacy_id` (set only on migrated items).
  - **`module:<slug>` labels** (require triage permission): `affected_modules`, including the reserved safety tags (`module:review-gate`, `module:convergence-detector`, `module:retry-loop`, `module:bugfix-loop`). This keeps bugfix-loop's fail-closed safety classification with a maintainer.
  - **Native GitHub features**: sub-issues (hierarchy), blocked-by (dependencies), issue types (type, falling back to `type:<x>` labels), and the repository milestone for an Epic's `milestone` field. adev's own milestone lifecycle (`milestones.json`, `/adev:issues milestone`) stays local and unchanged.
  - **Issue title and body** map to `title` and `notes`. Both are untrusted, filer-editable text: neither is ever parsed for adev fields, and consumers that place it in agent context fence them the way the bridge fences GitHub-origin bodies today.
- **GitHub canonical IDs**: issues in the configured home `repo` are always `gh-<n>`, and that ID never changes when the project later spans more repositories; issues in any other repository are `gh-`-prefixed too, with owner and repository encoded losslessly (exact encoding fixed by the Live Spec). The reserved `gh-` prefix cannot collide with the legacy `epic-`/`issue-`/`bd-` grammar. `#<n>` is display-only. Recognized wherever IDs are validated (`lib/issues/id-utils.mjs`, and the session-capture and retro ID validators), and safe in file paths, YAML frontmatter, branch names, and commit trailers.
- **Sub-issue hierarchy**: on the github backend `walkTree()` traverses sub-issues rather than matching ID prefixes.
- **Write + re-read claims** on the github backend: `claim()` writes `owner`/`claimed_at`, reads back, and rolls back if another claimant won. The residual race window is documented; lease/TTL semantics (`tasks.claim_ttl_minutes`, stale-claim takeover) are unchanged.
- **Fail-fast preflight**: missing or unauthenticated `gh`, missing token scopes, an unreachable project, a missing or misconfigured field, or an unmapped status option each produce a named error. The github backend never falls back to JSON — a fallback would put writes on a board nobody reads.
- **Project setup**: a verb that verifies the configured project, or (after confirmation) creates the recommended default board — Status options Backlog / Ready / In Progress / In Review / Deferred / Done and the Priority, `owner`, `claimed_at`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, `legacy_id` fields. Suggested views are documented, not created.
- **Migration to GitHub** via the existing `adev issues migrate` verb with `--to github`: copies open items (all items with `--include-closed`), recreates hierarchy and dependencies, writes a MigrationIdMap, resolves old IDs through it on `get()`, and leaves the source board read-only.
- **Bridge coexistence**: on `backend: github`, the `autonomous-bugfix-loop` bridge's inbound copy is a no-op and its `bug` + `help wanted` gate becomes an eligibility filter; outbound comment writeback is unchanged. Because the loop's ordinary `IssueManager` calls (`claim()`, `close()`) now write GitHub state directly — Project fields and the issue's open/closed state — the amendment must also relax, for the github backend only, `autonomous-bugfix-loop/charter.md`'s invariant that the loop never changes GitHub issue state, labels, or assignees, and its Out of Scope exclusion of project/milestone writes. Assignees stay untouched on every backend. On this backend the adapter reads `affected_modules` from `module:<slug>` labels, which realizes that charter's deferred `affected_modules` GitHub Label Producer for github boards; the amendment records this. Because a github board may span repositories while that charter keeps one loop instance to one repository, the loop selects only issues in the home `repo` (`gh-<n>` IDs) — never an item it would try to fix in the wrong checkout. Implemented in `autonomous-bugfix-loop` via a coordinated amendment — this charter records the dependency.
- **GitHub conformance suite**: the adapter conformance tests run against recorded GraphQL fixtures so CI never needs a live project or token.

### Out of Scope

- Backlog visualization or UI dashboards
- External tracker sync to project-management trackers (Jira, Linear) — GitHub Issues is no longer covered by this exclusion as of revision 7; see In Scope and Migration Notes
- Work-item assignment to specific agents or users
- Time tracking or estimation
- **Strict enum validation on `type`** (kept free-text by design)
- **Strict tier depth enforcement** (depth is whatever the dotted ID expresses; no max)
- **Automatic backfill of legacy flat IDs into tiered model** (legacy IDs persist as-is; manual restructuring is a project-level decision, not a framework feature)
- **Safe automated reconciliation of concurrent pushes** to `beads-board` from independent clones/CI — real, confirmed risk from the revision-9 prototype spike (naive `git pull` produces textual JSONL conflicts; `br sync --merge` doesn't help; `br sync --reconcile-additive` requires a real `.db` that `--no-db` bootstrap never creates). Tracked separately as `issue-vtj7lp`; this revision covers topology only.
- **Rewriting or scrubbing `main`'s existing history** that already contains old `.beads/issues.jsonl` commits — those stay; only new board writes move to the orphan branch going forward.
- **Any change to `IssueManagerInterface` or what data the board stores** in the revision-9 beads-board work — that is a git-topology change, not a data-model change. (Revision 10 keeps the interface but extends `get()` to resolve migrated IDs.)
- **Writing GitHub assignees** (revision 10). The "work-item assignment to specific agents or users" exclusion above is reaffirmed for the github backend: claims live in `owner`/`claimed_at` only and never read or write the assignee. An opt-in display mirror is a deferred capability.
- **Offline mode or a local cache** of a github board. Agents need network access on that backend.
- **Two-way sync between `github` and a local backend.** GitHub *is* the board on that backend, not a mirror of one; the revision-7 bridge is a separate, copy-based mechanism owned by `autonomous-bugfix-loop`.
- **Enforcing approval gates via branch protection, CODEOWNERS, or required checks.** The github backend makes this practical but does not implement it; deferred to `unified-gates/charter.md` (Transitions, `approver_role`) and tracked as `adev-plugin-github-enforced-gates-groz`.
- **Migrating off GitHub** (`github` → `json`/`beads`). Deferred.
- **Classic Projects (v1).** Only Projects v2 is supported.

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Planning | internal module | `/adev:plan` creates Features and Tasks from plan files; reads tier config from manifest |
| Implementation | internal module | `/adev:implement` claims and closes Tasks during execution; updates `next_action` on transitions |
| Validation | internal module | `/adev:validate` records outcomes and advances `next_action` |
| Design | internal module | `/adev:specify` creates a Feature work item bound 1:1 to each Live Spec |
| All lifecycle skills | internal modules | Each skill updates `next_action` on state transitions (convention, not enforced) |
| Setup | internal module | `/adev:sync` emits task management block in agent files |
| beads_rust | optional external CLI | `br` commands for the beads backend; not an npm dependency |
| GitHub CLI (`gh`) | optional external CLI | GraphQL/REST access for the github backend, with `repo` and `project` token scopes; required only when `tasks.backend: github`; not an npm dependency. Already a runtime dependency of the bugfix-loop bridge, so no new-dependency ADR is required |
| Autonomous Bugfix Loop | internal module | Owns the revision-7 GitHub Issues bridge; on `tasks.backend: github` amends its inbound sync to be a no-op (label gate retained as an eligibility filter) and relaxes its "never changes GitHub issue state" invariant and project/milestone exclusion for writes made through `IssueManager` |
| Agent-Reliable State Artifacts | internal module | Owns board state-file formats (`tasks.json`); revision 10 coordinates with it on the post-migration read-only marker |
| Unified Gates | internal module | Owns the deferred GitHub-enforced approval-gate follow-up (`adev-plugin-github-enforced-gates-groz`); no runtime dependency in this revision |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| WorkItem | Generic tiered work unit (unifies former Epic and Issue entities) | id (dotted or legacy flat), title, status, priority (0-4), type (free-text, default "task"), parent_id (optional), next_action (free-text, optional), plan_ref (optional), plan_task (optional), dependencies [], notes, **affected_modules (optional array of manifest `modules[].slug` values or reserved safety tags, default empty — see revision 8 Migration Notes)**, created, updated |
| TierConfig | Manifest-driven tier prefix convention (json/file/beads backends) | prefixes (default `{e: Epic, f: Feature, t: Task}`); override via `tasks.tier_prefixes` |
| IssueBoard | The persistent store containing all work items | backend (json/file/beads/github), project-root, tier_config |
| GithubBoardConfig | Manifest configuration of a github board (revision 10) | project (Projects v2 URL), repo (`<owner>/<repo>` where new issues are created), status_field (single-select field adev drives), status_map (adev status → project option for writes; one or more options → adev status for reads), priority_field (optional; fallback `priority:N` labels), type source (issue types, or `type:<x>` labels) |
| MigrationIdMap | The old-ID → GitHub-item link written by a migration to github (revision 10). Stored **on the GitHub item itself** as a read-only `legacy_id` Project field, not in a repository file: the target board is the single source of truth, as the beads migration already settled when it retired `.beads-map.json` because a second store could disagree with the board. Visible in every clone and in CI, and the key that makes re-runs idempotent | per migrated item: `legacy_id` (old adev ID); the source backend and migration time are recorded in the migration report, not on the item |

On the github backend a WorkItem's `id` is a **GitHub canonical ID** — `gh-<n>` for the home repository, or a `gh-`-prefixed owner/repository/number encoding for any other repository — derived from GitHub's issue number and never minted by adev. All other WorkItem attributes are unchanged.

### Relationships

- A WorkItem may have one parent WorkItem (resolved by ID prefix or legacy `epicId` for flat IDs)
- A WorkItem with no parent is a root item (typically an Epic in the default convention)
- A WorkItem may have zero or more child WorkItems (resolved by ID prefix match)
- A WorkItem may depend on zero or more other WorkItems (blocking dependency, cross-tier allowed)
- A WorkItem may reference a plan file (`plan_ref`) and a task line within that plan (`plan_task`)
- A Feature WorkItem (any item at the second tier under default convention) corresponds 1:1 to a Live Spec when created by `/adev:specify`
- On the github backend: a WorkItem's parent is its GitHub sub-issue parent and its children are its sub-issues; a blocking dependency is a GitHub blocked-by link
- A migrated WorkItem has exactly one old ID in the MigrationIdMap, and `get(oldId)` resolves to it

### Invariants

- Status values: `open`, `in_progress`, `closed`, `deferred` (aligned with beads_rust)
- Priority values: 0-4 (critical, high, medium, low, backlog)
- Type values: free-text string; default `"task"` if omitted; non-empty when present
- A WorkItem cannot be `closed` **through the `IssueManager` contract** while it has unclosed blocking dependencies
- A WorkItem cannot be `closed` **through the `IssueManager` contract** while it has unclosed children (e.g., closing `e1` requires all `e1.*` to be closed first)
- WorkItem IDs are unique within a project
- The tiered-ID invariants below (format, per-parent counters, depth by dot count, prefix-based tree walking) apply to the `json`, `file`, and `beads` backends. The `github` backend's own invariants follow them.
- Tiered IDs match `^<prefix>\d+(\.<prefix>\d+)*$` where prefixes come from `TierConfig`
- Per-parent counters are monotonic (closing or deleting `e1.f1.t1` does not free that ID for future tasks under `e1.f1`)
- Hierarchy depth is determined by dot count in the ID; no maximum depth
- Legacy flat IDs (`epic-N`, `issue-N`, `bd-XXXXXX`) continue to parse and operate as root-level WorkItems with no enforced parent relationship
- Tree walking via `walkTree(parentId)` is defined only for tiered IDs (`e1.*`, `e1.f1.*`, etc.). For legacy flat IDs, `walkTree` returns an empty list; hierarchy queries against legacy items are out of scope by design. Callers needing hierarchy semantics on legacy items must explicitly migrate them to tiered IDs first.

**github backend (revision 10):**

- Every github ID starts with the reserved `gh-` prefix and is classified by that prefix before the legacy grammar is consulted. Home-repository issues are exactly `gh-<n>`; other repositories use a lossless owner + repository + number encoding, so `org1/api#3` and `org2/api#3` get different IDs. Adding a repository to the project never changes an existing ID; hierarchy depth is sub-issue nesting depth, bounded only by GitHub's own sub-issue limits
- `walkTree(parentId)` is defined for every github ID and returns all transitive sub-issues
- Each adev status writes exactly one project Status option; on read, `status_map` may map several options to one adev status. An open issue whose Status option is unmapped is a named read error, never silently treated as `open`
- `closed` follows the GitHub issue state: a closed GitHub issue reads as `closed` regardless of its project field, and closing a WorkItem closes the GitHub issue
- The unclosed-dependency and unclosed-children closure guards are enforced by the adapter on adev writes. A person closing an issue in the GitHub UI bypasses them; the adapter reports the state it reads
- Claims are stored only in the `owner` and `claimed_at` project fields, never in the assignee; `owner` is always the identity the caller passes, never the authenticated `gh` user
- After a migration to github, the source board is read-only: writes to it through any adapter throw a named error. The read-only marker is stored in the source board's own storage, whose location and format (json and beads alike) are fixed with `agent-reliable-state-artifacts` during specification; see Migration Notes
- An open GitHub issue whose Status option maps to `closed` reads as `open` (the issue state wins in both directions); `adev issues github setup --check` reports it as drift
- `GithubAdapter` enforces the board-granularity invariant: it refuses `planTask`, exactly as the json adapter does, so plan-task state stays in the lifecycle log

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Issue CRUD | Create, read, update, close work items via `lib/issues/` module | must-have | 1 | validated |
| Epic CRUD | (Legacy) Create, read, update, close epics; group issues under epics. **Subsumed by Unified create() API in Phase 3** — kept as a separate row for traceability of the original Phase 1 contract. | must-have | 1 | validated |
| File Backend | Single `tasks.md` markdown table storage with parse/serialize | must-have | 1 | validated |
| Beads Backend | Wrap `br` CLI commands with ID mapping and auto-fallback | must-have | 1 | validated |
| Backend Registry | Manifest-driven adapter selection with detection and fallback | must-have | 1 | validated |
| Plan Integration | `/adev:plan` creates work items from plan tasks with plan-ref | must-have | 1 | validated |
| Implement Integration | `/adev:implement` claims items on start, closes on completion | must-have | 1 | validated |
| Validate Integration | `/adev:validate` records pass/fail outcome on items | must-have | 1 | validated |
| User-Facing Skill | `/adev:issues` for ad-hoc creation, bug filing, board viewing | must-have | 1 | validated |
| Constitution Section | Task Management section in constitution template | should-have | 1 | validated |
| Sync Block | Task management block emitted by `/adev:sync` into agent files | should-have | 1 | validated |
| Status Integration | `/adev:status` reads issue board for progress dashboard | nice-to-have | 2 | — |
| Recover Integration | `/adev:recover` reads/resets stuck work items | nice-to-have | 2 | — |
| Hygiene Audit | `/adev:hygiene` audits stale items, orphaned boards | nice-to-have | 2 | — |
| Compaction Context | Inject claimed-item context on session compaction | nice-to-have | 2 | — |
| **Tiered Hierarchy** | Adaptable Epic → Feature → Task model with dotted IDs and per-parent counters; supports 2-N tiers | must-have | 3 | — |
| **next_action Field** | Free-text guidance field updated by skills on state transitions; reduces agent drift in long sessions | must-have | 3 | — |
| **Generic Type Field** | Free-text type with default `"task"`; replaces strict enum | must-have | 3 | — |
| **Manifest Tier Config** | Optional `tasks.tier_prefixes` allowing projects to override default `e/f/t` prefixes | should-have | 3 | — |
| **Legacy ID Compatibility** | Existing flat `epic-N`/`issue-N`/`bd-XXXXXX` IDs continue to parse and work alongside tiered IDs | must-have | 3 | — |
| **Unified create() API** | Single create method accepting tier inferred from `parent_id`; deprecates `createEpic`/`createIssue` (kept temporarily for back-compat) | must-have | 3 | — |
| **Tree Walking** | `walkTree(parentId)` returns all descendant items via prefix match | must-have | 3 | — |
| **Specify Integration** | `/adev:specify` creates a Feature work item bound 1:1 to each Live Spec it authors | should-have | 3 | — |
| **Closure Cascade Guard** | Closing an item is blocked while unclosed children exist (mirrors existing dependency guard) | should-have | 3 | — |
| **Backend Migration** | One-shot CLI conversion of the issue board between configured backends (json ↔ beads, json ↔ file). Idempotent via `.beads-map.json` mapping or title-match fallback; supports `--dry-run` and `--include-closed`. Prompts before flipping `tasks.backend` in manifest.yaml. Operationalizes the Consistency quality attribute. | must-have | 4 | validated |
| **Issue Content Contract** | Content template (Problem/Intent, Acceptance Criteria, Out of Scope) prompted on `/adev:issues create` for `feature`/`bug` types; `spec_ref` and `next_action` pass-through and defaulting; soft (non-blocking) empty-body warning; plan-level epic `notes` summary. Backfilled here from `issue-content-contract.spec.md`, authored directly via `/adev:specify` (`charter-extension: true`) — see Migration Notes. | should-have | — | validated |
| **Beads Board Git Topology** | `.beads/` provisioned as a `git worktree` linked to a dedicated orphan `beads-board` branch (unrelated history to `main`); composes with existing `resolveStorageRoot()` worktree-sharing so local worktrees are unaffected. Fresh-clone bootstrap is one command (`git worktree add .beads beads-board`) — validated live in the revision-9 prototype spike, no separate `git fetch` needed. | must-have | 5 | validated |
| **Beads Board Direct Sync** | `adev issues sync --push` CLI verb: flush local board mutations and push directly to `beads-board`, no PR, no branch-protection exception, since nothing merges into `main`. Explicitly single-writer-safe only for this milestone — safe reconciliation of concurrent pushes from independent clones/CI is a known, tracked gap (`issue-vtj7lp`), not solved here. | must-have | 5 | — |
| **Beads Board Migration Tool** | One-shot conversion for an existing repo (this one): snapshot current `.beads/issues.jsonl` state from `main` onto the new orphan branch, remove `.beads/` from `main`'s tree, add `main`'s `.gitignore` entry, replace with the linked worktree. Idempotent, dry-runnable — mirrors the existing Backend Migration capability's shape. | must-have | 5 | validated |
| **GitHub Board Backend** | `GithubAdapter` implements the full `IssueManager` contract against GitHub Issues + Projects v2, registered as `tasks.backend: github`. Maintainer-only field placement: Project fields for Status, Priority, `owner`, `claimed_at`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`; `module:<slug>` labels for `affected_modules`; native sub-issues, blocked-by, issue types, Epic milestone; title/body as `title`/`notes`, body never parsed for adev fields. | must-have | 6 | specified |
| **GitHub Canonical IDs** | `gh-<n>` (home repo, stable) and `gh-`-prefixed owner/repo/number IDs for other repositories, recognized by `id-utils` and by the session-capture and retro ID validators; `#<n>` display-only. | must-have | 6 | specified |
| **GitHub Claim Lease** | `claim()` as write + re-read + rollback on a lost race; `release()`. Documented race window; TTL takeover on `claimed_at` unchanged. | must-have | 6 | specified |
| **GitHub Fail-Fast Preflight** | Named errors for missing `gh`, missing auth or scopes, unreachable project, missing or misconfigured field, unmapped status option. No JSON fallback. | must-have | 6 | specified |
| **GitHub Project Setup** | Verb that verifies the configured project, or creates the recommended default board (Status options Backlog / Ready / In Progress / In Review / Deferred / Done; Priority, `owner`, `claimed_at`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, `legacy_id` fields). Never writes without confirmation. Views are documented, not created. | should-have | 6 | specified |
| **GitHub Batched Reads** | `list()` and `walkTree()` fetch in batched GraphQL pages, not one call per item. | must-have | 6 | specified |
| **Migration to GitHub** | `adev issues migrate --to github`: copies open items (all with `--include-closed`), recreates hierarchy and dependencies, writes the MigrationIdMap, resolves old IDs through it, leaves the source board read-only. `--dry-run`, idempotent re-runs, confirmation before the manifest flip. | must-have | 6 | specified |
| **Bridge Coexistence** | On `backend: github` the bugfix-loop bridge's inbound copy is a no-op, the `bug` + `help wanted` gate becomes an eligibility filter, outbound comments unchanged, and the loop's "never changes GitHub issue state" invariant is relaxed for `IssueManager`-mediated writes. Implemented in `autonomous-bugfix-loop` via a coordinated amendment; this row records the dependency. | must-have | 6 | — |
| **GitHub Conformance Suite** | Adapter conformance tests against recorded GraphQL fixtures; CI needs no live project or token. | must-have | 6 | specified |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Status Integration | `/adev:status` reads issue board for progress dashboard | Phase 2 | — |
| Recover Integration | `/adev:recover` reads/resets stuck work items | Phase 2 | — |
| Hygiene Audit | `/adev:hygiene` audits stale items, orphaned boards | Phase 2 | — |
| Compaction Context | Inject claimed-item context on session compaction | Phase 2 | — |
| Backfill of legacy flat IDs into tiered model | Manual restructuring is a project-level decision; framework does not auto-migrate | — | — |
| Removal of deprecated `createEpic`/`createIssue` | Backward compatibility maintained until next major version bump | next major | Tiered Hierarchy adoption |
| **GitHub Issues Bridge** | Scope carved out 2026-08-19 (revision 7). Implementer is `autonomous-bugfix-loop/charter.md` (its Capability Map, Milestone 2), not this charter — this row exists only to record the carve-out and its target module. Do not re-implement here. Distinct from the GitHub Board Backend (revision 10), which makes GitHub the board rather than copying from it. | 5 | — |
| **Beads Board Concurrent-Write Reconciliation** | Safe, automated reconciliation of concurrent pushes to `beads-board` from independent clones/CI. Confirmed unsolved by `br`'s current CLI surface (revision-9 prototype spike): naive `git pull` produces textual JSONL conflicts, `br sync --merge` is blind to git refs, `br sync --reconcile-additive` requires a real `.db` the `--no-db` bootstrap path never creates. Tracked as `issue-vtj7lp`. | 6 | Beads Board Direct Sync |
| **GitHub-Enforced Approval Gates** | CODEOWNERS spec approval, a required `verify-pr` status check, deterministic validate in CI. Owned by `unified-gates/charter.md`, tracked as `adev-plugin-github-enforced-gates-groz`; recorded here only as a cross-reference. Works with any board backend. | — | — |
| **Migration off GitHub** | `github` → `json`/`beads`. No demand yet; the MigrationIdMap shape keeps it additive. | — | Migration to GitHub |
| **Assignee Mirror** | Opt-in display copy of `owner` to the GitHub assignee. Deferred because the work-item-assignment exclusion stands; would need a narrow carve-out. | — | GitHub Claim Lease |
| **Lifecycle Phase Field** | Lifecycle phase (Brainstorm … Validate) as a project field. Requires deciding whether lifecycle state syncs to GitHub, which this revision keeps local. | — | GitHub Board Backend |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `IssueManager.create(item)` | function | Create a work item at any tier; tier is inferred from `parent_id` (root if absent). Returns created item with assigned ID. |
| `IssueManager.update(id, changes)` | function | Update fields including `next_action`, `status`, `priority`, `notes`, `type` |
| `IssueManager.close(id, reason)` | function | Close a work item; blocked by unclosed dependencies (Phase 1, active). The unclosed-children guard is a Phase 3 addition (`Closure Cascade Guard` capability below) — until that capability ships, `close()` only enforces the dependency check. |
| `IssueManager.list(filters)` | function | List items filtered by status, parent, type, plan_ref, tier |
| `IssueManager.get(id)` | function | Get a single work item by ID (tiered or legacy flat) |
| `IssueManager.walkTree(parentId)` | function | Return all descendant items via prefix match (e.g., `walkTree("e1")` → all `e1.*`) |
| `IssueManager.addDependency(id, dependsOnId)` | function | Express a blocking dependency between work items (cross-tier allowed) |
| `IssueManager.createEpic(epic)` | function | (Deprecated, kept for back-compat) Calls `create()` with no parent |
| `IssueManager.updateEpic(id, changes)` | function | (Deprecated, kept for back-compat) Calls `update()` |
| `getIssueManager(manifest)` | function | Registry: returns active backend adapter; reads tier config from manifest. For `tasks.backend: github` returns `GithubAdapter` and never falls back to JSON — preflight failures throw named errors. |
| `IssueManager.*` on the github backend | function | Contract unchanged. `walkTree()` follows sub-issues; `claim()` is write + re-read + rollback; `get()` also resolves migrated old IDs via the MigrationIdMap; `claim(id, owner)` records the caller-supplied `owner`, never the authenticated `gh` user, so agents can run under a bot account or GitHub App. |
| `adev issues github setup [--check] [--dry-run]` | CLI verb | `--check`: read-only verification of the configured project, non-zero exit on drift. Without `--check`: offers to create the recommended default board and fields, after confirmation. |
| `tasks.github.*` | manifest config | `project`, `repo`, `status_field`, `status_map`, `priority_field`, type source. The `tasks.*` namespace stays co-owned with Setup. |
| GitHub preflight error codes | error contract | Named codes for: `gh` missing, unauthenticated, missing scopes, project not found, field missing, unmapped status option, rate limited. Separately, a write to a board left read-only by a migration throws its own named error from the json/beads adapters. Exact names fixed by the Live Spec. |
| `/adev:issues` | skill | User-facing skill — supports tiered creation and tree views |
| `adev issues migrate --to <backend>` | CLI verb | Convert the active issue board to the target backend. Defaults: scope=open/in_progress/deferred (use `--include-closed` for full history), source=current `tasks.backend` (override with `--from`). Idempotent via `.beads-map.json` (or title-match fallback). Supports `--dry-run`. Prompts before flipping `tasks.backend` in manifest.yaml — never auto-writes. Revision 10 adds `--to github`, which writes the MigrationIdMap and marks the source board read-only; `--to github` re-runs are idempotent through the MigrationIdMap, never through title matching. |
| `adev issues sync --push` | CLI verb | Flush local board mutations and push directly to `beads-board`. No PR, no branch-protection exception. Single-writer-safe only this milestone (see `issue-vtj7lp`). |
| `adev issues board migrate` | CLI verb | One-shot: convert an existing `main`-tracked `.beads/` (this repo's current state) into the orphan-branch + linked-worktree topology. Idempotent, `--dry-run` supported — mirrors the existing `adev issues migrate` capability's shape. |
| CLI install/bootstrap flow (`cli/index.mjs`) | internal | Provisions `.beads/` as a linked worktree against `beads-board` on fresh install — the one-command flow (`git worktree add .beads beads-board`) validated in the revision-9 prototype spike. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `manifest.yaml` (tasks.backend) | Setup | Backend selection configuration |
| `manifest.yaml` (tasks.tier_prefixes) | Setup | Optional override for tier prefix conventions (default: `{e: Epic, f: Feature, t: Task}`). Manifest schema is owned by setup, but the `tasks.*` namespace is co-owned with task-management — coordinate schema additions across both charters. |
| `br create`, `br list`, `br update`, `br close`, `br dep add` | beads_rust (external, optional) | Beads backend operations |
| Plan file structure (`.plan.md`) | Planning | Reads plan task list to create work items |
| Live Spec frontmatter | Design | `/adev:specify` reads spec metadata to create a 1:1 Feature work item |
| `git worktree`, `git push`, `git fetch` | git (external) | Orphan branch creation, linked-worktree provisioning, direct push to the board branch. |
| `br sync --flush-only` / `--no-db` | beads_rust (external, optional) | Underlying flush mechanics wrapped by `adev issues sync --push`. |
| `gh api graphql`, `gh auth status` | GitHub CLI (external, optional) | Transport and auth for the github backend; `repo` and `project` scopes. |
| GitHub GraphQL API | GitHub (external service) | Projects v2 items and fields, sub-issues, issue dependencies, issue types, milestones. |
| `tasks.backend` read by the tracker bridge | Autonomous Bugfix Loop | The bridge reads it to make inbound copy a no-op and keep the label gate on the github backend (coordinated amendment). |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Portability | File and JSON backends work on any system with Node.js. Beads backend degrades gracefully when `br` is absent. The github backend requires network access and an authenticated `gh` and **fails fast instead of degrading** — a deliberate exception, since a fallback would put writes on a board nobody reads. |
| Consistency | All backends produce identical logical state at the `IssueManager` contract. The github backend's documented differences are its ID shape, the basis of `walkTree` (sub-issues), non-linearizable claims, closure guards that people can bypass by closing in the GitHub UI, the named read error for an unmapped Status option, and issue state winning over the Status field (an open issue in a `closed`-mapped column reads as `open`). The conformance suite asserts the shared invariants on every backend and these differences on github. Switching backends mid-project must not lose data semantics — operationalized by the **Backend Migration** capability with idempotent re-runs and dry-run preview. |
| Simplicity | File backend is a single readable markdown file. No database, no build step, no config beyond a few manifest fields. |
| Extensibility | New backends added by implementing the interface and registering in the registry. New tier conventions added via manifest config without code changes. |
| Testability | All adapters testable with Node.js built-in test runner. Beads adapter testable with mocked execSync. GitHub adapter testable against recorded GraphQL fixtures — no network or token in CI. |
| Claim Safety | On the github backend, claims are write + re-read + rollback. Two claimants can both believe they won only when one's precondition read lands before the other's write; that window is documented, and callers needing a strict lock are told to use another one. TTL takeover is unchanged. |
| API Efficiency | On the github backend, API calls for `list()` and `walkTree()` scale with result pages, not item count. Rate-limit responses fail with a named error, never a partial result. |
| **Adaptability** | Tiered hierarchy supports 2-N tiers via dotted IDs; default 3-tier (`e/f/t`) but extensible per project. Type field is free-text with sensible defaults. |
| **Backward Compatibility** | Legacy flat IDs (`epic-N`, `issue-N`, `bd-XXXXXX`) continue to work indefinitely. Existing 8 epics + 75 issues on adev-plugin remain readable and editable without migration. |
| **Anti-Drift** | `next_action` field provides explicit next-step guidance for agents picking up work mid-session. Convention encourages skill invocations as the value (e.g., `"Run /adev:specify --module multi-repo-workspace"`). |
| **Zero-Friction Sync** | Board mutations reach the shared, git-tracked board with no PR and no branch-protection exception — nothing in the sync path ever merges into `main`. On the github backend this and History Cleanliness hold trivially: the board never writes to git. |
| **History Cleanliness** | `main`'s commit log is never polluted by board churn (claims, releases, priority edits); a contributor running `git log -- lib/` on `main` sees only source changes. |
| **Public Visibility** | The board stays public and git-tracked by design — that's what makes the "portable, no vendor lock-in, versioned with the code" pitch real. Formalized norm: no secrets, credentials, or PII in issue bodies. A git-tracked commit is permanent once pushed, unlike an editable GitHub issue — this is a real constraint, not a suggestion. Scoped to the git-backed backends: a github board's visibility follows its project and repository settings, and the no-secrets norm still applies. |

## Migration Notes

This is revision 3 (2026-04-16). Revision 2 introduced the Epic → Issue model; revision 3 generalizes to a tiered hierarchy with three new capabilities (tiered IDs, `next_action`, generic type) and a unified API. All revision-2 behavior is preserved:

- Existing flat IDs continue to parse and operate as root-level work items
- `createEpic`/`createIssue` methods continue to work (calling unified `create()` internally) until removed in a future major version
- The `type` field accepts the previous enum values (`bug`, `feature`, `task`) without change; new free-text values are also accepted
- Manifest config is additive — projects without `tasks.tier_prefixes` get the default `e/f/t` convention
- Skills updated to write `next_action` will treat the field as optional when reading old work items that lack it

The migration is opt-in. Projects can adopt tiered IDs, `next_action`, and generic types incrementally without rewriting existing work items.

Revision 5 (2026-05-19) adds the **Backend Migration** capability as the operational realization of the Consistency quality attribute. No domain-model changes — only an interface addition (`adev issues migrate` CLI verb). The verb is idempotent and dry-runnable; manifest writes require user confirmation.

Not to be confused with `adev migrate` (format-shape migration of legacy state artifacts, owned by the `agent-reliable-state-artifacts` charter). `adev issues migrate` operates one level up — it converts the *configured backend* of the issue board using existing adapters, while `adev migrate` converts artifact *shapes* (e.g., markdown/YAML → JSON/JSONL).

Revision 7 (2026-08-19) carves GitHub Issues out of the External Tracker Sync exclusion, human-approved during requirements work for `.context-index/research/autonomous-bugfix-loop.md` (which needs external bug intake so contributors can file bugs that an unattended fixer loop then works). Prior research at `.context-index/research/issue-board-merge-conflicts.md` §4b had already modeled this exact tradeoff (rate limits, latency, credential handling, offline-loss, local/remote impedance mismatch) and flagged it as a charter-level decision, not a spec-level one — this revision is that decision. Jira and Linear remain excluded; nothing about their tradeoffs was reconsidered here. The bridge's actual design (conflict resolution, field mapping, which side is authoritative, credential storage) is deferred to a future Live Spec — see the **GitHub Issues Bridge** row in Deferred Capabilities.

**Open follow-up, not resolved by this revision**: `strategic-planning/charter.md` and `context-viz/charter.md` repeat the same "External tracker sync (Jira, Linear, GitHub Issues)" exclusion in their own Out of Scope sections. Those charters were not amended here — their exclusions may now be inconsistent with this one and should be reviewed separately before anyone relies on GitHub Issues sync from those modules' contexts.

Revision 8 (2026-08-19) adds `affected_modules` to `WorkItem`, driven by architecture review of `autonomous-bugfix-loop/charter.md`'s `bug-selection-and-eligibility` spec: three independent reviewers found that spec's safety-boundary exclusion (BEH-6/BEH-7 — "the modules implementing the review gate, the convergence detector, the retry loop") had no producer anywhere in the codebase, and that `manifest.yaml`'s `modules[]` granularity is too coarse to express it (the `lib` slug covers all of `lib/`, including unrelated code, alongside the safety-critical `lib/loop-convergence.mjs`). `affected_modules` closes that gap as an **optional**, human/maintainer-supplied field, deliberately not auto-inferred from issue content — see `bug-selection-and-eligibility.spec.md` BEH-6/BEH-7/BEH-10 for the consuming behavior and its fail-closed default (an untagged WorkItem is excluded from autonomous attempt, not silently permitted). This keeps classification authority with a human rather than parsing potentially-adversarial issue text (relevant once the GitHub bridge lands), and sidesteps `modules[]`'s coarseness by also accepting a small set of reserved safety tags (`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`) alongside real module slugs.

Revision 9 (2026-08-22) adds the Beads Board Git Topology / Direct Sync / Migration Tool capabilities, moving the beads backend's board data off `main`'s history onto a dedicated orphan `beads-board` branch, checked out as a linked `git worktree` at `.beads/`. Motivated by two friction points surfaced while running `/adev:bugfix-loop` unattended: (1) syncing board mutations back to `main` required a full PR cycle even though board churn is operational metadata, not reviewable code — the same friction that motivated `issue-i0ji37`'s `--no-db` bootstrap fix, which this revision's fresh-clone bootstrap flow directly composes with; (2) local git worktrees already share one physical board via `resolveStorageRoot()`, but separate clones and CI/cloud sandboxes had no equivalently frictionless path.

A prototype spike (real git/br commands against a scratch repo — bare origin + two independent clones) validated the core topology: orphan-branch + linked-worktree bootstrap is one command (`git worktree add .beads beads-board`, no separate fetch needed since a plain clone already carries the ref), and direct pushes to `beads-board` genuinely never touch `main`. The same spike surfaced a real, unresolved risk — concurrent pushes from independent clones can produce textual JSONL merge conflicts that `br sync --merge` does not resolve (it is local db-vs-jsonl only, blind to git refs), and `br sync --reconcile-additive`, which looks like the right primitive, requires a real `.db` file that the `--no-db` bootstrap path never creates. That gap is tracked separately as `issue-vtj7lp` and is explicitly out of scope for this revision: Beads Board Direct Sync ships single-writer-safe only.

The OSS-visibility question (should the board be public at all) was raised and resolved in the same conversation: yes, status quo, formalized as the Public Visibility quality attribute rather than reconsidered.

Revision 10 (2026-11-25) adds the **GitHub Board Backend** (agentic-development/adev-plugin#441): a GitHub Projects v2 board becomes the issue board itself, read and written directly through the unchanged `IssueManager` contract, for teams that would otherwise keep two boards. It is distinct from the revision-7 **GitHub Issues Bridge** (owned by `autonomous-bugfix-loop`), which copies triaged issues onto a local board; on `backend: github` that copy becomes a no-op and its label gate becomes an eligibility filter, which needs a coordinated amendment there.

Maintainer decisions taken in this revision:

- **IDs** are GitHub numbers in canonical form (`gh-<n>` for the home repository, `gh-`-prefixed owner/repo/number for others — refined after charter review found `<repo>-<n>` could collide with the legacy grammar and across owners, and would rewrite existing IDs when a repository was added), not tiered IDs stored as metadata. Tiered IDs would turn every lookup into a full-board scan and allow duplicate IDs, since GitHub enforces no uniqueness on metadata; the tiered-ID invariants therefore become backend-specific.
- **Fields live only where maintainers can write them**: every adev field is a Project field, `affected_modules` is `module:<slug>` labels, and the body is notes only. The first draft put write-once refs in a body metadata block; charter review showed the issue author can edit the body, so an external filer could plant a `spec_ref` or `branch` for an agent to act on — and the bridge's fencing no longer runs when nothing is copied. Project fields are also single-field writes, so claims stay safe from concurrent body edits.
- **Milestones**: an Epic's `milestone` maps to the GitHub repository milestone; adev's milestone lifecycle stays local.
- **Claims** are write + re-read + rollback, with the race window documented, rather than omitting `claim()` (which would leave `/adev:bugfix-loop` and parallel agents without a lock).
- **Assignees are never written.** The work-item-assignment exclusion stands; an opt-in mirror is deferred.
- **Setup** ships a recommended default board rather than mapping only onto existing columns; lifecycle-phase columns are deferred because they would require syncing lifecycle state to GitHub.
- **Migration to GitHub** is in scope; migration off GitHub is deferred.
- **Approval-gate enforcement** through branch protection belongs to `unified-gates` (`adev-plugin-github-enforced-gates-groz`) and works with any backend.

Existing backends change in one respect only: after a migration to github, the json and beads adapters refuse writes to the source board. The marker that records this is board state, so its location and format are fixed with `agent-reliable-state-artifacts` (which owns `tasks.json`) during specification. The MigrationIdMap lives on the GitHub items as a `legacy_id` Project field, so it needs no repository file — corrected during specification after finding that `.beads-map.json`, which the first wording proposed to generalize, had already been retired in favour of the board being its own source of truth.
