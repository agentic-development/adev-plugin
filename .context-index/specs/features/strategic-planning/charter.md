---
kind: module
status: approved
revision: 3
updated: 2026-04-27
---

# Feature Charter: strategic-planning

<!-- Feature Charter for the strategic-planning module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

Strategic-planning provides three distinct concerns: persistent, structured research (`/adev:research`), end-to-end build orchestration (`/adev:build`), and the user-facing issue-board surface (`/adev:issues`). Strategic ceremony around product vision and release sequencing is folded into adjacent skills: vision identity into `/adev:brainstorm` (design module); milestone definition and release sequencing into `/adev:plan` (planning module). This module retains research, build orchestration, status reads, and issue management.

## Scope and Boundaries

### In Scope

- Persistent, structured research with internal and external sources
- End-to-end build orchestration (review → route → plan → implement → validate)
- Issue board integration at every state transition (downstream consumer of task-management module)
- `/adev:status` aggregation reads of progress, milestones, and issues (read-only — does not define milestones)
- Milestone-aware reads in `/adev:status` and `/adev:work` intake mode

Notes:
- Product vision identity bootstrap is delegated to `/adev:brainstorm` (design module)
- Milestone definition and release sequencing are delegated to `/adev:plan` (planning module)
- Issue model and tiered hierarchy are owned by task-management module

### Out of Scope

- Replacing existing skills (brainstorm, specify, plan, implement, validate remain unchanged)
- Sprint/cycle time-boxing or velocity tracking (not relevant for single-developer agentic workflows)
- External issue tracker sync (JIRA, Linear, GitHub Issues)
- Burndown charts or visual dashboards
- Standalone `/adev:vision` skill — folded into `/adev:brainstorm` (identity bootstrap) and `/adev:plan --milestone` (milestone definition)
- Standalone `/adev:roadmap` skill — folded into `/adev:plan --release` (release sequencing)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `lib/issues/` | shared library | Issue model for tiered work items, hierarchy, dependencies |
| task-management | internal module | Owns the issue model; this module is a downstream consumer |
| `/adev:brainstorm` | internal skill | Receives bootstrap responsibility for `product.md` identity (formerly `/adev:vision`) |
| `/adev:plan` | internal skill | Receives milestone definition and release sequencing (formerly `/adev:vision`/`/adev:roadmap`); build orchestrator chains plan as a step |
| `/adev:review-specs` | internal skill | Build orchestrator chains this as first step |
| `/adev:route` | internal skill | Build orchestrator chains this optionally |
| `/adev:implement` | internal skill | Build orchestrator chains this |
| `/adev:validate` | internal skill | Build orchestrator chains this as final step |
| `product.md` | context artifact | `/adev:status` reads this file (writes are owned by `/adev:brainstorm`) |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| ResearchArtifact | Persistent research document | slug, question, sources, findings, recommendations, relatesTo |

### Relationships

- A ResearchArtifact may relate to a spec, charter, or issue
- `/adev:status` reads from product.md, charters, specs, and the issue board (no entities owned)
- `/adev:build` orchestrates a sequence of skill invocations (no persistent entities owned)

### Invariants

- Research artifacts are immutable once created (append new findings, don't overwrite)
- Build orchestrator must stop on failure — no partial builds that skip failing steps
- Status reads do not mutate any state — pure read-only aggregation

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|------------|-------------|----------|-------|--------|
| `/adev:research` skill | Persistent structured research using web, GitHub, and internal codebase sources | must-have |  | validated |
| `/adev:status` aggregation | Read-only progress dashboard reading product.md, charters, specs, issue board; supports milestone view | must-have |  | — |
| `/adev:work` intake mode | `--intake` for batch-processing incoming requests into categorized, prioritized issues (renamed from `/adev:start intake mode` per start charter rev 2) | should-have |  | — |
| `/adev:build` orchestrator | Two pipeline modes: Full (`--full`: specify → review → plan → route → implement → validate) and Implement (default: plan → route → implement → validate). Route runs by default. Resume support and phase batching. | must-have |  | implemented |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Multi-team coordination | Future charter scope | — | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev:research <topic>` | Skill | Research a topic and produce persistent artifact |
| `/adev:research --web` | Flag | Include web search sources |
| `/adev:research --github <repo>` | Flag | Include GitHub code search |
| `/adev:research --internal` | Flag | Include internal codebase analysis |
| `/adev:research --compare` | Flag | Comparative analysis mode |
| `/adev:research --issue <id>` | Flag | Link research to an issue |
| `/adev:build --spec <path>` | Skill | End-to-end build for a single spec (Implement Pipeline) |
| `/adev:build --spec <path> --full` | Flag | Full Pipeline: specify → review → plan → route → implement → validate |
| `/adev:build --phase <name>` | Flag | Batch build all review-passed specs in a milestone |
| `/adev:build --phase <name> --full` | Flag | Batch full pipeline including review-pending specs |
| `/adev:build --resume` | Flag | Resume interrupted build |
| `/adev:build --resume --from <step>` | Flag | Resume from a specific step (specify/review/plan/route/implement/validate) |
| `/adev:build --no-route` | Flag | Disable route step for current build |
| `/adev:build --dry-run` | Flag | Preview build steps without executing |
| `/adev:status` | Skill | Read-only progress aggregation across product, charters, specs, and issues |
| `/adev:status --milestone <name>` | Flag | Aggregate by milestone |
| `/adev:work --intake` | Flag | Batch intake mode (renamed from `/adev:start --intake`) |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `getIssueManager(manifest)` | `lib/issues/registry.mjs` | Issue board access |
| `IssueManager.create()` / `update()` / `walkTree()` | task-management | Tiered work item operations (replaces direct `createEpic`/`createIssue` calls) |
| `addDependency()` | task-management | Cross-item dependency tracking |
| `/adev:review-specs` | Assessment module | Build orchestrator invokes for spec review |
| `/adev:specify` | Design module | Build orchestrator invokes in Full Pipeline (--full) for spec authoring and revision |
| `/adev:route` | Assessment module | Build orchestrator invokes for task routing — mandatory by default, disabled only via --no-route |
| `/adev:plan` | Planning module | Build orchestrator invokes for task decomposition; receives milestone/release planning responsibilities |
| `/adev:implement` | Implementation module | Build orchestrator invokes for execution |
| `/adev:validate` | Validation module | Build orchestrator invokes for verification |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Graceful Degradation | Research skill works even if WebSearch or GitHub MCP tools are unavailable |
| Idempotency | Status reads can be re-run safely (read-only); build orchestrator can resume |
| Resumability | Build orchestrator can resume from last successful step after interruption |
| Consistency | All skills follow the established issue board integration pattern (check tasks.backend, skip if unconfigured) |
| Read-Only Status | `/adev:status` never mutates state — pure aggregation reads |

## Migration Notes

This is revision 2 (2026-04-16). Revision 1 owned `/adev:vision` and `/adev:roadmap` skills, plus milestone-related extensions and the Epic milestone field. Revision 2 sheds these responsibilities as part of the strategic-planning consolidation (epic-9):

- `/adev:vision` is removed; identity bootstrap of `product.md` moves to `/adev:brainstorm` (design module rev 2); milestone definition moves to `/adev:plan --milestone` (planning module rev 2)
- `/adev:roadmap` is removed; release sequencing moves to `/adev:plan --release`
- The Epic milestone field and milestone-aware Issue extensions move to task-management module rev 3
- `/adev:status` and `/adev:issues` consume the new tiered work item model from task-management rev 3
- `/adev:start intake mode` becomes `/adev:work intake mode` per start charter rev 2

Backward compatibility: legacy callers of `/adev:vision` or `/adev:roadmap` will need to migrate to the new skill destinations. There is no shim or alias — slash commands are not aliasable.
