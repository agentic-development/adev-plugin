---
status: approved
revision: 1
updated: 2026-04-05
---

# Feature Charter: strategic-planning

<!-- Feature Charter for the strategic-planning module.
     This defines WHAT the module does and its boundaries, not HOW it is built.
     Live Specs within this charter define specific behavioral contracts. -->

## Business Intent

Add product-level strategic planning, release sequencing, persistent research, and automated build orchestration to the adev lifecycle. Currently the framework handles single-feature development well (brainstorm → specify → review → plan → implement → validate) but lacks abstractions for planning larger work — releases, roadmaps, multi-feature coordination. This charter fills the gap between "I have an idea" and "I have a charter," and adds an end-to-end orchestrator for the post-specify pipeline.

## Scope and Boundaries

### In Scope

- Product vision definition and milestone planning (updates `product.md`)
- Release sequencing with cross-feature dependency analysis
- Persistent, structured research with internal and external sources
- End-to-end build orchestration (review → route → plan → implement → validate)
- Milestone field on epics in the issue model
- Milestone-aware extensions to `/adev-issues`, `/adev-status`, `/adev-start`
- Issue board integration at every state transition

### Out of Scope

- Replacing existing skills (brainstorm, specify, plan, implement, validate remain unchanged)
- Sprint/cycle time-boxing or velocity tracking (not relevant for single-developer agentic workflows)
- External issue tracker sync (JIRA, Linear, GitHub Issues)
- Multi-team coordination (future charter)
- Burndown charts or visual dashboards

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `lib/issues/` | shared library | Issue model for epics, issues, and dependencies |
| `/adev-brainstorm` | internal skill | Vision output feeds into brainstorm as upstream context |
| `/adev-specify` | internal skill | Roadmap informs which specs to write next |
| `/adev-review-specs` | internal skill | Build orchestrator chains this as first step |
| `/adev-route` | internal skill | Build orchestrator chains this optionally |
| `/adev-plan` | internal skill | Build orchestrator chains this |
| `/adev-implement` | internal skill | Build orchestrator chains this |
| `/adev-validate` | internal skill | Build orchestrator chains this as final step |
| `product.md` | context artifact | Vision reads and updates this file |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Milestone | A named release target grouping features | name, targetDate, status (planned/active/completed), featureList |
| ResearchArtifact | Persistent research document | slug, question, sources, findings, recommendations, relatesTo |
| ReleasePhase | A sequenced stage within a roadmap | milestone, features, dependencies, riskLevel, implementationOrder |
| Epic (extended) | Existing epic with milestone field | id, title, status, milestone, planRef |

### Relationships

- A Milestone contains one or more ReleasePhases (or is a single phase for simple releases)
- A ReleasePhase references one or more Feature Charters
- An Epic is tagged with a Milestone name
- A ResearchArtifact may relate to a spec, charter, or issue

### Invariants

- A Milestone name must be unique within `product.md`
- The `milestone` field on Epic is optional for backward compatibility
- Research artifacts are immutable once created (append new findings, don't overwrite)
- Build orchestrator must stop on failure — no partial builds that skip failing steps
- Vision updates `product.md` but only proposes constitution amendments (never edits constitution directly)

## Capability Map

| Capability | Description | Priority | Phase | Status |
|------------|-------------|----------|-------|--------|
| Issue model milestone support | Add optional `milestone` field to Epic typedef, validation, and both adapters | must-have | v1 | — |
| `/adev-research` skill | Persistent structured research using web, GitHub, and internal codebase sources | must-have | v1 | — |
| `/adev-vision` skill | Interview-driven product vision and milestone planning, updates `product.md`, creates milestone epics | must-have | v1 | — |
| `/adev-roadmap` skill | Release sequencing with cross-feature dependency analysis, critical path, risk assessment | must-have | v1 | — |
| `/adev-issues` milestone extension | Add `--milestone` to epic creation and list filtering, group board display by milestone | must-have | v1 | — |
| `/adev-status` milestone view | Add milestone progress aggregation to `--all` mode and `--milestone` argument | should-have | v1 | — |
| `/adev-start` intake mode | Add `--intake` for batch-processing incoming requests into categorized, prioritized issues | should-have | v1 | — |
| `/adev-build` orchestrator | Chain review → route → plan → implement → validate with resume support and phase batching | must-have | v2 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev-vision` | Skill | Define/update product vision, milestones, feature inventory |
| `/adev-vision --refresh` | Flag | Update existing vision rather than creating new |
| `/adev-vision --milestone <name>` | Flag | Focus on a single milestone |
| `/adev-roadmap` | Skill | Produce sequenced release plan from approved vision |
| `/adev-roadmap --milestone <name>` | Flag | Plan a single milestone |
| `/adev-roadmap --all` | Flag | Full roadmap across all milestones |
| `/adev-research <topic>` | Skill | Research a topic and produce persistent artifact |
| `/adev-research --web` | Flag | Include web search sources |
| `/adev-research --github <repo>` | Flag | Include GitHub code search |
| `/adev-research --internal` | Flag | Include internal codebase analysis |
| `/adev-research --compare` | Flag | Comparative analysis mode |
| `/adev-research --issue <id>` | Flag | Link research to an issue |
| `/adev-build --spec <path>` | Skill | End-to-end build for a single spec |
| `/adev-build --phase <name>` | Flag | Batch build all specs in a milestone |
| `/adev-build --resume` | Flag | Resume interrupted build |
| `/adev-build --dry-run` | Flag | Preview build steps without executing |
| `Epic.milestone` | Data field | Optional string field on Epic model |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `getIssueManager(manifest)` | `lib/issues/registry.mjs` | Issue board access for epic/issue CRUD |
| `createEpic()` / `updateEpic()` | Issue adapters | Epic management with milestone field |
| `addDependency()` | Issue adapters | Cross-epic dependency tracking |
| `/adev-review-specs` | Assessment module | Build orchestrator invokes for spec review |
| `/adev-route` | Assessment module | Build orchestrator invokes for task routing |
| `/adev-plan` | Planning module | Build orchestrator invokes for task decomposition |
| `/adev-implement` | Implementation module | Build orchestrator invokes for execution |
| `/adev-validate` | Validation module | Build orchestrator invokes for verification |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Backward Compatibility | Existing tasks.md files without Milestone column must parse correctly |
| Graceful Degradation | Research skill works even if WebSearch or GitHub MCP tools are unavailable |
| Idempotency | Vision and roadmap can be re-run safely (update, not duplicate) |
| Resumability | Build orchestrator can resume from last successful step after interruption |
| Consistency | All skills follow the established issue board integration pattern (check tasks.backend, skip if unconfigured) |
