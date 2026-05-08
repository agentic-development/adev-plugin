---
status: draft
revision: 1
updated: 2026-05-08
tracker-ref: issue-355
---

# Feature Charter: milestone-lifecycle

## Business Intent

Milestones provide structured lifecycle management for release planning within the adev framework. Today, milestones are freeform strings scattered across charters, specs, epics, and `product.md` with no central definition, validation, or lifecycle. This module introduces `milestones.yaml` as the source of truth for milestone definitions, adds `milestone create/list/ship/defer` subcommands to `/adev:issues`, and integrates validation into existing lifecycle skills — enabling a streamlined two-command flow from milestone definition to tagged release.

## Scope and Boundaries

### In Scope

- `milestones.yaml` in `.context-index/` — structured definitions with name, status, target date, epic link, release config, and ship criteria
- Milestone lifecycle states: `planned`, `active`, `shipped`, `deferred`
- `/adev:issues` subcommands: `milestone create`, `milestone list`, `milestone ship`, `milestone defer`
- Auto-linking: `milestone create` auto-creates the linked epic through the issue manager
- Ship criteria evaluation: auto-checks (`all_issues_closed`, `gates_pass`) and manual confirms
- Version bump prompt at ship time when milestone name matches semver
- Git tag creation and optional GitHub release draft on ship
- Milestone name validation in lifecycle skills (brainstorm, specify, plan, hygiene) against `milestones.yaml` — advisory warnings only, never blocking

### Ownership Note

This module supersedes `/adev:plan --milestone` as the entrypoint for milestone *definition*. `/adev:plan --milestone` retains its role of decomposing a milestone into epics and feature placeholders, but reads milestone metadata from `milestones.yaml` rather than prompting inline. The `strategic-planning` and `planning` charters should be updated to reference this module for milestone definitions.

### Out of Scope

- Automatic status transitions (planned to active) — status is updated explicitly or by future automation
- Changelog generation beyond what `gh release create --generate-notes` provides
- npm publish orchestration — users run `npm publish` manually
- Custom auto-check types beyond `all_issues_closed` and `gates_pass` (extensible later)
- Milestone templates or milestone-level branching strategies
- Cross-workspace milestone coordination

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| `/adev:issues` | Extends | New `milestone` subcommands added to the skill |
| `lib/issues/` | Consumes | Epic create/update/close through issue manager abstraction |
| `manifest.yaml` | Consumes | Reads `gates.test` for the `gates_pass` ship criterion |
| `/adev:brainstorm` | Integrates | Validates Phase column values against `milestones.yaml` |
| `/adev:specify` | Integrates | Validates `milestone:` frontmatter against `milestones.yaml` |
| `/adev:plan --milestone` | Integrates | Validates milestone name exists before planning |
| `/adev:hygiene` | Integrates | Flags orphan milestone references not in `milestones.yaml` |
| `/adev:status` | Integrates | Reads `milestones.yaml` for milestone metadata in status reports |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Milestone | A structured release target with lifecycle state | `name`, `status` (planned/active/shipped/deferred), `target_date`, `epic_id`, `release` (tag, npm), `ship_criteria` |
| ShipCriterion | A single pass/fail condition evaluated at ship time | `check` (auto-evaluable type) OR `confirm` (manual prompt string) |
| MilestoneFile | The `milestones.yaml` file containing all milestone definitions | `milestones` (array of Milestone entries) |

### Relationships

- A MilestoneFile contains zero or more Milestones
- A Milestone contains zero or more ShipCriteria
- A Milestone links to exactly one Epic on the issue board via `epic_id`
- An Epic links back to its Milestone via the existing `milestone` field on the issue model
- Capability Map Phase columns and spec `milestone:` frontmatter reference a Milestone by name

### Invariants

- Milestone names must be unique within `milestones.yaml`
- A Milestone's `epic_id` must reference an existing epic on the issue board. If the epic is deleted externally, `milestone list` warns about the broken link and `milestone ship` blocks with an error requiring the epic to be recreated or the milestone updated.
- `milestone ship` blocks unless all auto-checks pass and all manual confirms are accepted
- `milestone ship` is idempotent — shipping an already-shipped milestone is a no-op with a message
- Only one milestone can transition to `shipped` per invocation — no batch shipping
- The `release.tag` field, when present, must not match an existing git tag. `milestone ship` checks before tagging.

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Milestone Create | `milestone create <name>` — defines `milestones.yaml` schema (name, status, target_date, epic_id, release, ship_criteria), writes the entry, and auto-creates linked epic via issue manager | Must-have | v1 | — |
| Milestone List | `milestone list` — displays all milestones with status, target date, and issue progress summary | Must-have | v1 | — |
| Ship Criteria Evaluation | Run auto-checks (`all_issues_closed`, `gates_pass`) then manual confirms. Collect pass/fail for each. | Must-have | v1 | — |
| Milestone Ship | `milestone ship <name>` — evaluate criteria, prompt version bump if semver, git tag, optional GitHub release | Must-have | v1 | — |
| Milestone Defer | `milestone defer <name>` — set status to deferred, add reason to milestone entry | Should-have | v1 | — |
| Name Validation in Lifecycle Skills | Brainstorm, specify, plan, and hygiene validate milestone names against `milestones.yaml` | Should-have | v1 | — |
| Status Integration | `/adev:status --milestone <name>` reads `milestones.yaml` for metadata alongside issue progress | Nice-to-have | v1 | — |

## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Automatic status transitions | Complexity of detecting "work started" reliably across backends | v2 | — |
| npm publish orchestration | Manual workaround exists, low risk of error | v2 | Milestone Ship |
| Custom auto-check types | Two built-in checks cover common cases; extensibility deferred | v2 | Ship Criteria Evaluation |
| Cross-workspace milestone coordination | Requires workspace-level issue board (not yet available) | v2 | Multi-repo workspace |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `loadMilestones(projectRoot)` | function | Reads and parses `milestones.yaml`, returns array of Milestone objects |
| `saveMilestones(projectRoot, milestones)` | function | Writes Milestone array back to `milestones.yaml` |
| `findMilestone(projectRoot, name)` | function | Returns a single Milestone by name, or null if not found |
| `evaluateShipCriteria(milestone, issueManager, manifest)` | function | Runs auto-checks (`all_issues_closed`, `gates_pass`) and returns results array with pass/fail per criterion. Does not run manual confirms. GitHub release availability is not a ship criterion — it is a post-ship step handled separately by `milestone ship` with graceful degradation. |
| `milestone create <name> [--target <date>]` | CLI subcommand | Creates milestone definition and linked epic |
| `milestone list` | CLI subcommand | Displays milestones with status and progress |
| `milestone ship <name>` | CLI subcommand | Evaluates criteria, prompts version bump, tags, releases |
| `milestone defer <name> --reason "<text>"` | CLI subcommand | Sets milestone status to deferred |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|--------------|-------------|
| `getIssueManager(manifest)` | `lib/issues/registry.mjs` | Get issue manager for epic create/update/close |
| `createEpic({ title, milestone })` | Issue manager interface | Create linked epic when milestone is created |
| `list({ epic })` | Issue manager interface | List issues under milestone epic for `all_issues_closed` check |
| `update(id, { status })` | Issue manager interface | Close epic when milestone ships |
| `manifest.gates.test` | `manifest.yaml` | Test command for `gates_pass` ship criterion |
| `gh release create` | GitHub CLI (external) | Create GitHub release on ship (optional, not a code dependency) |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Idempotency | `milestone create` with an existing name updates the entry rather than duplicating. `milestone ship` on an already-shipped milestone is a no-op. |
| Backend Agnostic | All epic operations go through the issue manager abstraction. Milestone management works identically with file-based and beads backends. |
| Graceful Degradation | If `gh` CLI is not available, `milestone ship` completes the git tag but skips GitHub release with a warning. If no `ship_criteria` are defined, ship proceeds with only the interactive version bump prompt. |
| Safety | `milestone ship` never force-pushes tags. Blocks if the tag already exists. Version bump requires explicit confirmation. |
| Backward Compatibility | Projects without `milestones.yaml` behave identically to today. Existing freeform milestone strings on epics continue to work. Milestone name validation in all integrated skills (brainstorm, specify, plan, hygiene) is advisory — a warning is printed but the operation is never blocked. |
| Testability | `loadMilestones`, `saveMilestones`, `findMilestone`, and `evaluateShipCriteria` are pure functions operating on file paths and issue manager instances. Testable with fixture YAML and mock issue managers using existing test helpers. |
