---
status: approved
revision: 1
updated: 2026-03-29
---

# Feature Charter: adev-start

## Business Intent

`adev-start` is a pre-lifecycle triage skill that classifies incoming work, detects in-progress project state, and routes the user to the correct `/adev-*` skill with context. It eliminates the need for users to know which skill to invoke, providing a single entry point for all work types.

## Scope and Boundaries

### In Scope

- Classify incoming work into known types (new feature, new spec, spec update, bug fix, refactor, review, plan, implement, maintenance)
- Scan project state for in-progress work (incomplete plans, unreviewed specs, recent sessions)
- Propose a route with one-line reasoning; confirm with user if ambiguous
- Invoke the target `/adev-*` skill once confirmed
- Redirect to `/adev-init` if no `.context-index/` exists

### Out of Scope

- Does not perform any lifecycle work itself (no chartering, specifying, planning, debugging)
- Does not replace `using-adev` as the educational gateway
- Does not auto-invoke without user confirmation (always proposes, never silently dispatches)
- Does not run as a hook or auto-inject at session start

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `.context-index/` | internal context | Reads plans, specs, sessions, and manifest for state detection |
| All `/adev-*` skills | internal skills | Routing targets invoked after classification and confirmation |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Work Request | The user's incoming description of what they want to do | raw description, classified type, confidence level |
| Work Type | One of the recognized classification categories | slug (e.g. `new-feature`, `bug-fix`), target skill, requires charter (bool) |
| Project State | Snapshot of in-progress work detected from context index | incomplete plans (list), unreviewed specs (list), recent sessions (list) |
| Route Proposal | The skill's recommendation to the user | target skill, reasoning (one line), pre-loaded context hints |

### Relationships

- A Work Request is classified into exactly one Work Type
- Project State may override or refine the Work Type (e.g. user says "work on auth" → state shows incomplete auth plan → route to `/adev-implement` instead of `/adev-brainstorm`)
- A Route Proposal combines Work Type + Project State into a single actionable recommendation

### Invariants

- Every route must map to exactly one `/adev-*` skill
- The skill never proceeds without user confirmation (explicit or implicit "sounds right")
- If `.context-index/` is missing, the only valid route is `/adev-init`

## Capability Map

| Capability | Description | Priority | Phase | Status |
|-----------|-------------|----------|-------|--------|
| Work Classification | Classify user's description into a known work type using intent + keywords | must-have | 1 | — |
| Project State Scan | Glob/Grep for incomplete plans, unreviewed specs, recent sessions | must-have | 1 | — |
| Route Proposal | Combine classification + state into a single recommendation with reasoning | must-have | 1 | — |
| Confirmation Flow | Present proposal, accept confirmation or ask clarifying question if ambiguous | must-have | 1 | — |
| Skill Invocation | Invoke the target `/adev-*` skill with relevant context | must-have | 1 | — |
| Init Gate | Detect missing `.context-index/` and redirect to `/adev-init` | must-have | 1 | — |
| Resume Detection | Surface in-progress work before classifying new work | should-have | 1 | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `/adev-start` | Skill invocation | Entry point — accepts optional free-text description of work to do |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `.context-index/specs/features/*/plan.md` | Context index | Scan for incomplete task checkboxes |
| `.context-index/specs/features/**/*.md` | Context index | Detect specs without `.review.md` siblings |
| `.context-index/sessions/*.md` | Context index | Read recent session summaries |
| `.context-index/manifest.yaml` | Context index | Module list for context routing |
| Any `/adev-*` skill | Skills | Target skill dispatched after confirmation |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Latency | State scan completes within a single tool-call round (parallel Glob/Grep); total triage under 2 user round-trips for clear cases |
| Accuracy | Correct classification for unambiguous requests (bug, new feature, implement plan); ambiguous cases must ask rather than guess wrong |
| Simplicity | Pure markdown skill, no companion code, no new dependencies |
