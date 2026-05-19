---
status: approved
revision: 4
updated: 2026-05-19
tracker-ref: issue-355
---

# Feature Charter: milestone-lifecycle

## Business Intent

Milestones provide structured lifecycle management for release planning within the adev framework. Today, milestones are freeform strings scattered across charters, specs, epics, and `product.md` with no central definition, validation, or lifecycle. This module introduces `milestones.yaml` as the source of truth for milestone definitions, adds `milestone create/list/ship/defer` subcommands to `/adev:issues`, and integrates validation into existing lifecycle skills — enabling a streamlined two-command flow from milestone definition to tagged release.

### Storage Format Authority

This charter retains ownership of *what* milestones mean: lifecycle states (`planned`, `active`, `shipped`, `deferred`), ship-criteria evaluation, release-strategy semantics, milestone validation rules. *How* milestone state is persisted on disk — the `.context-index/milestones.json` schema (renamed from `milestones.yaml`), `lib/milestones.mjs` wrapper, atomic temp-rename writes — is owned by the `agent-reliable-state-artifacts` charter. See `.context-index/specs/features/agent-reliable-state-artifacts/charter.md`.

## Scope and Boundaries

### In Scope

- `milestones.yaml` in `.context-index/` — structured definitions with name, status, target date, epic link, release config, and ship criteria
- Milestone lifecycle states: `planned`, `active`, `shipped`, `deferred`
- `/adev:issues` subcommands: `milestone create`, `milestone list`, `milestone ship`, `milestone defer`
- Auto-linking: `milestone create` auto-creates the linked epic through the issue manager
- Ship criteria evaluation: auto-checks (`all_issues_closed`, `gates_pass`) and manual confirms
- Configurable release strategy per milestone (`manual`, `tag-only`, `release-please`)
- Strategy-based ship execution: governance-only, git-tag, or release-please integration
- Milestone name validation in lifecycle skills (brainstorm, specify, plan, hygiene) against `milestones.yaml` — advisory warnings only, never blocking

### Ownership Note

This module supersedes `/adev:plan --milestone` as the entrypoint for milestone *definition*. `/adev:plan --milestone` retains its role of decomposing a milestone into epics and feature placeholders, but reads milestone metadata from `milestones.yaml` rather than prompting inline. The `strategic-planning` and `planning` charters should be updated to reference this module for milestone definitions.

### Out of Scope

- Automatic status transitions (planned to active) — status is updated explicitly or by future automation
- Changelog generation — delegated to external tools (release-please, `gh release --generate-notes`, etc.)
- npm publish orchestration — delegated to CI pipelines or manual execution
- Custom auto-check types beyond `all_issues_closed` and `gates_pass` (extensible later)
- Milestone templates or milestone-level branching strategies
- Cross-workspace milestone coordination

### Dependencies

| Module | Direction | Why |
|--------|-----------|-----|
| `/adev:issues` | Extends | New `milestone` subcommands added to the skill |
| `lib/issues/` | Consumes | Epic create/update/close through issue manager abstraction |
| `manifest.yaml` | Consumes | Reads `gates.test` for the `gates_pass` ship criterion |
| `/adev:brainstorm` | Integrates | Validates Milestone column values against `milestones.yaml` |
| `/adev:specify` | Integrates | Validates `milestone:` frontmatter against `milestones.yaml` |
| `/adev:plan --milestone` | Integrates | Validates milestone name exists before planning |
| `/adev:hygiene` | Integrates | Flags orphan milestone references not in `milestones.yaml` |
| `/adev:status` | Integrates | Reads `milestones.yaml` for milestone metadata in status reports |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Milestone | A structured release target with lifecycle state | `name`, `status` (planned/active/shipped/deferred), `target_date`, `epic_id`, `release` ({ strategy: manual\|tag-only\|release-please }), `ship_criteria` |
| ShipCriterion | A single pass/fail condition evaluated at ship time | `check` (auto-evaluable type) OR `confirm` (manual prompt string) |
| MilestoneFile | The `milestones.yaml` file containing all milestone definitions | `milestones` (array of Milestone entries) |

### Relationships

- A MilestoneFile contains zero or more Milestones
- A Milestone contains zero or more ShipCriteria
- A Milestone links to exactly one Epic on the issue board via `epic_id`
- An Epic links back to its Milestone via the existing `milestone` field on the issue model
- Capability Map Milestone columns and spec `milestone:` frontmatter reference a Milestone by name

### Invariants

- Milestone names must be unique within `milestones.yaml`
- A Milestone's `epic_id` must reference an existing epic on the issue board. If the epic is deleted externally, `milestone list` warns about the broken link and `milestone ship` blocks with an error requiring the epic to be recreated or the milestone updated.
- `milestone ship` blocks unless all auto-checks pass and all manual confirms are accepted
- `milestone ship` is idempotent — shipping an already-shipped milestone is a no-op with a message
- Only one milestone can transition to `shipped` per invocation — no batch shipping
- The `release.strategy` field, when present, must be one of `manual`, `tag-only`, or `release-please`. Unknown values are rejected at create and ship time.
- When strategy is `tag-only`, the computed git tag must not match an existing git tag. `milestone ship` checks before tagging.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|------------|-------------|----------|-------|--------|
| Milestone Create | `milestone create <name>` — defines `milestones.yaml` schema (name, status, target_date, epic_id, release, ship_criteria), writes the entry, and auto-creates linked epic via issue manager | Must-have |  | planned |
| Milestone List | `milestone list` — displays all milestones with status, target date, and issue progress summary | Must-have |  | planned |
| Ship Criteria Evaluation | Run auto-checks (`all_issues_closed`, `gates_pass`) then manual confirms. Collect pass/fail for each. | Must-have |  | validated |
| Milestone Ship | `milestone ship <name>` — evaluate criteria, execute release strategy (manual/tag-only/release-please), update status | Must-have |  | validated |
| Milestone Defer | `milestone defer <name>` — set status to deferred, add reason to milestone entry | Should-have |  | specified  |
| Name Validation in Lifecycle Skills | Brainstorm, specify, plan, and hygiene validate milestone names against `milestones.yaml` | Should-have |  | planned |
| Status Integration | `/adev:status --milestone <name>` reads `milestones.yaml` for metadata alongside issue progress | Nice-to-have |  | planned |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Automatic status transitions | Complexity of detecting "work started" reliably across backends |  | — |
| npm publish orchestration | Delegated to CI (release-please strategy) or manual. Adding a built-in publish strategy is low-value. |  | Milestone Ship |
| Custom auto-check types | Two built-in checks cover common cases; extensibility deferred |  | Ship Criteria Evaluation |
| Cross-workspace milestone coordination | Requires workspace-level issue board (not yet available) |  | Multi-repo workspace |

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
| `milestone ship <name>` | CLI subcommand | Evaluates criteria, executes release strategy, updates status |
| `milestone defer <name> --reason "<text>"` | CLI subcommand | Sets milestone status to deferred |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|--------------|-------------|
| `getIssueManager(manifest)` | `lib/issues/registry.mjs` | Get issue manager for epic create/update/close |
| `createEpic({ title, milestone })` | Issue manager interface | Create linked epic when milestone is created |
| `list({ epic })` | Issue manager interface | List issues under milestone epic for `all_issues_closed` check |
| `update(id, { status })` | Issue manager interface | Close epic when milestone ships |
| `manifest.gates.test` | `manifest.yaml` | Test command for `gates_pass` ship criterion |
| `gh release create` | GitHub CLI (external) | Create GitHub release draft on ship (strategy: `tag-only`, optional) |
| `gh pr list` | GitHub CLI (external) | Detect open Release PR (strategy: `release-please`, optional) |
| `release-please-config.json` | Project file | Write `release-as` version target (strategy: `release-please`) |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Idempotency | `milestone create` with an existing name updates the entry rather than duplicating. `milestone ship` on an already-shipped milestone is a no-op. |
| Backend Agnostic | All epic operations go through the issue manager abstraction. Milestone management works identically with file-based and beads backends. |
| Graceful Degradation | Strategy `tag-only`: if `gh` CLI unavailable, git tag is created but GitHub release is skipped with a warning. Strategy `release-please`: if config file missing, falls back to `manual` with a warning. If `gh` unavailable, PR detection is skipped. If no `ship_criteria` defined, ship proceeds directly to release execution. |
| Safety | `milestone ship` never force-pushes tags. Blocks if the tag already exists. Version bump requires explicit confirmation. |
| Backward Compatibility | Projects without `milestones.yaml` behave identically to today. Existing freeform milestone strings on epics continue to work. Milestone name validation in all integrated skills (brainstorm, specify, plan, hygiene) is advisory — a warning is printed but the operation is never blocked. |
| Testability | `loadMilestones`, `saveMilestones`, `findMilestone`, and `evaluateShipCriteria` are pure functions operating on file paths and issue manager instances. Testable with fixture YAML and mock issue managers using existing test helpers. |
