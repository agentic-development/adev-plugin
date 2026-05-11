---
status: approved
revision: 2
updated: 2026-04-24
---

# Feature Charter: Debug Playbooks

## Business Intent

Complex projects accumulate domain-specific debugging knowledge that doesn't fit into either heuristics (too lightweight — single tips) or ADRs (architectural decisions, not diagnostic procedures). Debug playbooks fill this gap: per-module and cross-cutting markdown files that map failure modes to ordered diagnostic steps, loaded by `/adev:debug` Phase 2 alongside existing context. They reduce time-to-root-cause by guiding investigation with "check these things in this order" procedures specific to each module's technology and failure patterns.

## Scope and Boundaries

### In Scope

- Module-scoped playbook files at `.context-index/specs/features/<module>/debug-playbook.md`
- Cross-cutting playbook at `.context-index/specs/cross-cutting/debug-playbook.md` for failure modes that span modules (API patterns, database issues, CI/CD, etc.)
- Structured format: failure modes with triggers (symptom patterns), ordered diagnostic steps, expected findings, and escalation criteria
- Playbook steps may reference project scripts (e.g., `./scripts/diagnostics/check-db.sh`) as part of diagnostic actions
- Template at `templates/debug-playbook-template.md`
- `/adev:debug` Phase 2 integration — load both the module playbook and cross-cutting playbook, match failure modes against Phase 1 symptoms
- Authoring path via `/adev:learn` — when a lesson is procedural (multi-step), write a playbook entry instead of a heuristic
- `/adev:hygiene` integration — detect stale playbooks (module changed significantly since last update)
- `/adev:retro` integration — flag repeated debug patterns across sessions as playbook candidates

### Out of Scope

- Standalone diagnostic script management (playbook steps may reference project scripts, but adev does not create, manage, or scaffold those scripts — that's project-level tooling)
- Automated playbook generation from logs or error telemetry
- Playbook versioning or revision tracking beyond what git provides
- Mandatory playbooks — modules work fine without one; playbooks are opt-in enrichment
- Merging with golden samples (different purpose, format, consumption phase, and curation criteria)

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| Implementation | internal module | `/adev:debug` gains a playbook loading step in Phase 2 |
| Heuristics | internal module | `/adev:learn` gains routing logic: procedural lessons → playbook, single tips → heuristic |
| Maintenance | internal module | `/adev:hygiene` gains a staleness check; `/adev:retro` gains candidate detection |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Playbook | Per-module or cross-cutting file containing failure modes | `module` (slug or `cross-cutting`), `last-verified` (date), `failure-modes[]` |
| Failure Mode | A named category of problems with diagnostic procedure | `id` (slug), `title`, `triggers[]`, `steps[]`, `escalation` |
| Trigger | Symptom pattern that activates a failure mode | `pattern` (string — error message, log output, or behavioral description) |
| Diagnostic Step | An ordered action to perform during investigation | `order`, `action` (instruction text), `command` (optional — inline or script reference), `expected` (what a healthy/unhealthy result looks like) |
| Escalation | When to stop following the playbook and change approach | `condition` (when to escalate), `target` (human, ADR review, architecture reassessment) |

### Relationships

- A **Playbook** contains one or more **Failure Modes**
- A **Failure Mode** has one or more **Triggers** and one or more **Diagnostic Steps**
- A **Failure Mode** has exactly one **Escalation** criteria
- `/adev:debug` Phase 1 symptoms are matched against **Triggers** to select relevant **Failure Modes**

### Invariants

- Each failure mode `id` must be unique within a playbook
- Diagnostic steps must have an explicit order — no unordered lists
- Every failure mode must have an escalation criteria (prevents infinite diagnostic loops)

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Playbook file format and template | Structured markdown format for failure modes, triggers, steps, and escalation. Template at `templates/debug-playbook-template.md` | must-have | 1 | validated |
| Debug Phase 2 loading | `/adev:debug` loads module playbook + cross-cutting playbook in Phase 2, presents relevant failure modes to guide investigation | must-have | 1 | validated |
| Trigger matching | Match Phase 1 symptoms (error messages, behavioral descriptions) against playbook triggers to surface the most relevant failure modes | must-have | 1 | validated |
| Learn skill routing | `/adev:learn` detects procedural lessons (multi-step) and routes to playbook entry creation instead of heuristic | should-have | 1 | — |
| Hygiene staleness check | `/adev:hygiene` detects playbooks whose module has changed significantly since `last-verified` date | should-have | 2 | — |
| Retro candidate detection | `/adev:retro` identifies repeated debug patterns across sessions and suggests new playbook entries | nice-to-have | 2 | — |

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| Playbook file | file convention | `.context-index/specs/features/<module>/debug-playbook.md` and `.context-index/specs/cross-cutting/debug-playbook.md` — structured markdown consumed by any skill or human reader |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| Debug Phase 2 | Implementation (`/adev:debug`) | Loads playbook, matches triggers against Phase 1 symptoms, presents relevant failure modes during investigation |
| Learn routing | Heuristics (`/adev:learn`) | Detects procedural lessons and appends failure mode entries to the appropriate playbook |
| Hygiene pass | Maintenance (`/adev:hygiene`) | Reads `last-verified` date, compares against module change history for staleness detection |
| Retro analysis | Maintenance (`/adev:retro`) | Scans debug session patterns for recurring failure modes not yet captured in a playbook |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Token efficiency | A single failure mode (triggers + steps + escalation) should fit within ~200 tokens. Phase 2 loads only matched failure modes, not the entire playbook |
| Discoverability | Trigger matching should surface relevant failure modes without the user needing to know a playbook exists. If no triggers match, the full failure mode list is presented as a menu |
| Authoring simplicity | A developer should be able to write a playbook entry in under 2 minutes after a debug session — plain markdown, no schema to memorize beyond the template |
| Graceful absence | Modules without playbooks work identically to today. No warnings, no degraded behavior — playbooks are pure enrichment |
| No code required | Trigger matching and failure mode selection are LLM-side operations within the debug skill's markdown instructions — no helper library or code-based matcher needed |
