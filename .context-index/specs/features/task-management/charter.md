---
status: approved
revision: 2
updated: 2026-03-31
---

# Feature Charter: Task Management

## Business Intent

The task-management module provides persistent, cross-skill issue tracking for the adev lifecycle. It replaces the ephemeral `TodoWrite` mechanism with a pluggable layer that persists issue state in the repository, supports an epic > issue hierarchy, and integrates with both a zero-setup file backend and the beads_rust CLI for scaling. Skills create, claim, update, and close issues programmatically via `lib/issues/`, while users manage epics and ad-hoc issues directly through `/adev-issues`.

## Scope and Boundaries

### In Scope

- Epic > Issue hierarchy with persistent state in the repository
- File-based backend storing all epics and issues in a single `tasks.md` markdown table
- beads_rust backend wrapping the `br` CLI with ID mapping and auto-fallback
- Adapter registry with manifest-driven backend selection and detection
- Issue CRUD operations via `lib/issues/` for programmatic use by skills
- `/adev-issues` skill for user-facing epic/issue management, bug filing, and board viewing
- Integration into `adev-plan` (epic + issue creation from plan tasks with plan-ref)
- Integration into `adev-implement` (claim issues on start, close on completion)
- Integration into `adev-validate` (record pass/fail outcome on issues)
- Constitution template section documenting task management
- Sync block emitted by `adev-sync` into agent files

### Out of Scope

- Backlog visualization or UI dashboards
- External tracker sync (Jira, Linear, GitHub Issues)
- Issue assignment to specific agents or users
- Time tracking or estimation
- Integration into adev-status, adev-recover, adev-hygiene, or compaction hooks (Phase 2)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Planning | internal module | adev-plan creates epics and issues from plan files |
| Implementation | internal module | adev-implement claims and closes issues during execution |
| Validation | internal module | adev-validate records outcomes on issues |
| Setup | internal module | adev-sync emits task management block in agent files |
| beads_rust | optional external CLI | `br` commands for the beads backend; not an npm dependency |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Epic | High-level work container grouping related issues | id, title, status, plan-ref (optional), created, updated |
| Issue | Concrete work item belonging to an epic or standalone | id, title, status, priority (0-4), type (bug/feature/task), epic-id (optional), plan-ref (optional), plan-task (optional), dependencies [], notes, created, updated |
| IssueBoard | The persistent store containing all epics and issues | backend (file/beads), project-root |

### Relationships

- An Epic has zero or more Issues
- An Issue belongs to zero or one Epic
- An Issue may depend on zero or more other Issues (blocking dependency)
- An Issue may reference a plan file (plan-ref) and a task number within that plan (plan-task)
- An Epic may reference a plan file (plan-ref)

### Invariants

- Status values are: `open`, `in_progress`, `closed`, `deferred` (aligned with beads_rust)
- Priority values are 0-4: critical, high, medium, low, backlog
- An Issue cannot be `closed` while it has unclosed blocking dependencies
- Issue IDs are unique within a project (`issue-N` for file backend, `bd-XXXXXX` for beads)
- Epic IDs are unique within a project (`epic-N` for file backend)

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Issue CRUD | Create, read, update, close issues via `lib/issues/` module | must-have | 1 | validated |
| Epic CRUD | Create, read, update, close epics; group issues under epics | must-have | 1 | validated |
| File Backend | Single `tasks.md` markdown table storage with parse/serialize | must-have | 1 | validated |
| Beads Backend | Wrap `br` CLI commands with ID mapping and auto-fallback | must-have | 1 | validated |
| Backend Registry | Manifest-driven adapter selection with detection and fallback | must-have | 1 | validated |
| Plan Integration | adev-plan creates epic + issues from plan tasks with plan-ref | must-have | 1 | validated |
| Implement Integration | adev-implement claims issues on start, closes on completion | must-have | 1 | validated |
| Validate Integration | adev-validate records pass/fail outcome on issues | must-have | 1 | validated |
| User-Facing Skill | `/adev-issues` for ad-hoc epics, bug filing, board viewing | must-have | 1 | validated |
| Constitution Section | Task Management section in constitution template | should-have | 1 | validated |
| Sync Block | Task management block emitted by adev-sync into agent files | should-have | 1 | validated |
| Status Integration | adev-status reads issue board for progress dashboard | nice-to-have | 2 | — |
| Recover Integration | adev-recover reads/resets stuck issues | nice-to-have | 2 | — |
| Hygiene Audit | adev-hygiene audits stale issues, orphaned boards | nice-to-have | 2 | — |
| Compaction Context | Inject claimed issue context on session compaction | nice-to-have | 2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `IssueManager.create(issue)` | function | Create an issue, returns created issue with ID |
| `IssueManager.update(id, changes)` | function | Update issue fields (status, priority, notes) |
| `IssueManager.close(id, reason)` | function | Close an issue with a reason string |
| `IssueManager.list(filters)` | function | List issues filtered by status, epic, type, plan-ref |
| `IssueManager.get(id)` | function | Get a single issue by ID |
| `IssueManager.createEpic(epic)` | function | Create an epic, returns created epic with ID |
| `IssueManager.updateEpic(id, changes)` | function | Update epic fields |
| `IssueManager.addDependency(issueId, dependsOnId)` | function | Express a blocking dependency between issues |
| `getIssueManager(manifest)` | function | Registry: returns active backend adapter based on manifest config |
| `/adev-issues` | skill | User-facing skill for managing epics, issues, and viewing the board |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `manifest.yaml` (tasks.backend) | Setup | Backend selection configuration |
| `br create`, `br list`, `br update`, `br close`, `br dep add` | beads_rust (external, optional) | Beads backend operations |
| Plan file structure (`.plan.md`) | Planning | Reads plan task list to create issues |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Portability | File backend works on any system with Node.js. Beads backend degrades gracefully when `br` is absent. |
| Consistency | Both backends produce identical logical state. Switching backends mid-project must not lose data semantics. |
| Simplicity | File backend is a single readable markdown file. No database, no build step, no config beyond one manifest field. |
| Extensibility | New backends can be added by implementing the interface and registering in the registry. |
| Testability | All adapters testable with Node.js built-in test runner. Beads adapter testable with mocked execSync. |
