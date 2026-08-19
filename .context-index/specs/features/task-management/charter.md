---
status: approved
revision: 8
updated: 2026-08-19
---

# Feature Charter: Task Management

## Business Intent

The task-management module provides persistent, cross-skill issue tracking for the adev lifecycle. It replaces the ephemeral `TodoWrite` mechanism with a pluggable layer that persists work-item state in the repository, supports an **adaptable tiered hierarchy (Epic → Feature → Task by default, with arbitrary depth via dotted IDs)**, and integrates with both a zero-setup file backend and the beads_rust CLI for scaling. Each work item carries a free-text **`next_action`** field that documents the next agent step (typically a skill invocation), reducing drift in long agent sessions. Skills create, claim, update, and close items programmatically via `lib/issues/`; users manage the board through `/adev:issues`.

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

### Out of Scope

- Backlog visualization or UI dashboards
- External tracker sync to project-management trackers (Jira, Linear) — GitHub Issues is no longer covered by this exclusion as of revision 7; see In Scope and Migration Notes
- Work-item assignment to specific agents or users
- Time tracking or estimation
- **Strict enum validation on `type`** (kept free-text by design)
- **Strict tier depth enforcement** (depth is whatever the dotted ID expresses; no max)
- **Automatic backfill of legacy flat IDs into tiered model** (legacy IDs persist as-is; manual restructuring is a project-level decision, not a framework feature)

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

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| WorkItem | Generic tiered work unit (unifies former Epic and Issue entities) | id (dotted or legacy flat), title, status, priority (0-4), type (free-text, default "task"), parent_id (optional), next_action (free-text, optional), plan_ref (optional), plan_task (optional), dependencies [], notes, **affected_modules (optional array of manifest `modules[].slug` values or reserved safety tags, default empty — see revision 8 Migration Notes)**, created, updated |
| TierConfig | Manifest-driven tier prefix convention | prefixes (default `{e: Epic, f: Feature, t: Task}`); override via `tasks.tier_prefixes` |
| IssueBoard | The persistent store containing all work items | backend (file/beads), project-root, tier_config |

### Relationships

- A WorkItem may have one parent WorkItem (resolved by ID prefix or legacy `epicId` for flat IDs)
- A WorkItem with no parent is a root item (typically an Epic in the default convention)
- A WorkItem may have zero or more child WorkItems (resolved by ID prefix match)
- A WorkItem may depend on zero or more other WorkItems (blocking dependency, cross-tier allowed)
- A WorkItem may reference a plan file (`plan_ref`) and a task line within that plan (`plan_task`)
- A Feature WorkItem (any item at the second tier under default convention) corresponds 1:1 to a Live Spec when created by `/adev:specify`

### Invariants

- Status values: `open`, `in_progress`, `closed`, `deferred` (aligned with beads_rust)
- Priority values: 0-4 (critical, high, medium, low, backlog)
- Type values: free-text string; default `"task"` if omitted; non-empty when present
- A WorkItem cannot be `closed` while it has unclosed blocking dependencies
- A WorkItem cannot be `closed` while it has unclosed children (e.g., closing `e1` requires all `e1.*` to be closed first)
- WorkItem IDs are unique within a project
- Tiered IDs match `^<prefix>\d+(\.<prefix>\d+)*$` where prefixes come from `TierConfig`
- Per-parent counters are monotonic (closing or deleting `e1.f1.t1` does not free that ID for future tasks under `e1.f1`)
- Hierarchy depth is determined by dot count in the ID; no maximum depth
- Legacy flat IDs (`epic-N`, `issue-N`, `bd-XXXXXX`) continue to parse and operate as root-level WorkItems with no enforced parent relationship
- Tree walking via `walkTree(parentId)` is defined only for tiered IDs (`e1.*`, `e1.f1.*`, etc.). For legacy flat IDs, `walkTree` returns an empty list; hierarchy queries against legacy items are out of scope by design. Callers needing hierarchy semantics on legacy items must explicitly migrate them to tiered IDs first.

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

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Status Integration | `/adev:status` reads issue board for progress dashboard | Phase 2 | — |
| Recover Integration | `/adev:recover` reads/resets stuck work items | Phase 2 | — |
| Hygiene Audit | `/adev:hygiene` audits stale items, orphaned boards | Phase 2 | — |
| Compaction Context | Inject claimed-item context on session compaction | Phase 2 | — |
| Backfill of legacy flat IDs into tiered model | Manual restructuring is a project-level decision; framework does not auto-migrate | — | — |
| Removal of deprecated `createEpic`/`createIssue` | Backward compatibility maintained until next major version bump | next major | Tiered Hierarchy adoption |
| **GitHub Issues Bridge** | Scope carved out 2026-08-19 (revision 7). Implementer is `autonomous-bugfix-loop/charter.md` (its Capability Map, Milestone 2), not this charter — this row exists only to record the carve-out and its target module. Do not re-implement here. | 5 | — |

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
| `getIssueManager(manifest)` | function | Registry: returns active backend adapter; reads tier config from manifest |
| `/adev:issues` | skill | User-facing skill — supports tiered creation and tree views |
| `adev issues migrate --to <backend>` | CLI verb | Convert the active issue board to the target backend. Defaults: scope=open/in_progress/deferred (use `--include-closed` for full history), source=current `tasks.backend` (override with `--from`). Idempotent via `.beads-map.json` (or title-match fallback). Supports `--dry-run`. Prompts before flipping `tasks.backend` in manifest.yaml — never auto-writes. |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `manifest.yaml` (tasks.backend) | Setup | Backend selection configuration |
| `manifest.yaml` (tasks.tier_prefixes) | Setup | Optional override for tier prefix conventions (default: `{e: Epic, f: Feature, t: Task}`). Manifest schema is owned by setup, but the `tasks.*` namespace is co-owned with task-management — coordinate schema additions across both charters. |
| `br create`, `br list`, `br update`, `br close`, `br dep add` | beads_rust (external, optional) | Beads backend operations |
| Plan file structure (`.plan.md`) | Planning | Reads plan task list to create work items |
| Live Spec frontmatter | Design | `/adev:specify` reads spec metadata to create a 1:1 Feature work item |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Portability | File backend works on any system with Node.js. Beads backend degrades gracefully when `br` is absent. |
| Consistency | Both backends produce identical logical state. Switching backends mid-project must not lose data semantics — operationalized by the **Backend Migration** capability with idempotent re-runs and dry-run preview. |
| Simplicity | File backend is a single readable markdown file. No database, no build step, no config beyond a few manifest fields. |
| Extensibility | New backends added by implementing the interface and registering in the registry. New tier conventions added via manifest config without code changes. |
| Testability | All adapters testable with Node.js built-in test runner. Beads adapter testable with mocked execSync. |
| **Adaptability** | Tiered hierarchy supports 2-N tiers via dotted IDs; default 3-tier (`e/f/t`) but extensible per project. Type field is free-text with sensible defaults. |
| **Backward Compatibility** | Legacy flat IDs (`epic-N`, `issue-N`, `bd-XXXXXX`) continue to work indefinitely. Existing 8 epics + 75 issues on adev-plugin remain readable and editable without migration. |
| **Anti-Drift** | `next_action` field provides explicit next-step guidance for agents picking up work mid-session. Convention encourages skill invocations as the value (e.g., `"Run /adev:specify --module multi-repo-workspace"`). |

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
