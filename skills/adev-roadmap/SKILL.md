---
name: adev-roadmap
description: "Analyze milestones, feature dependencies, and specs to produce a structured implementation roadmap. Use when the user says 'create a roadmap', 'show the dependency graph', 'what order should we build things', 'critical path', 'analyze dependencies', 'plan the implementation order', 'what can we parallelize', or wants to understand the sequencing and risk profile of their milestones."
---

# Generate Implementation Roadmap

Analyze product milestones, feature charters, and spec dependencies to produce a structured roadmap document. The roadmap includes a dependency graph, topologically sorted implementation order, critical path analysis, risk assessment, and parallelization opportunities. Output is saved to `.context-index/specs/roadmap/`.

**Announce at start:** "I'm using the adev-roadmap skill to generate the implementation roadmap."

## Arguments

- No arguments: produce a full roadmap across all milestones (same as `--all`)
- `--milestone <name>`: produce a roadmap for a single milestone only
- `--all`: explicit flag for full roadmap across all milestones (same as no arguments)

## Prerequisites

This skill requires:

1. `.context-index/` exists with `constitution.md` and `manifest.yaml`
2. `.context-index/specs/product.md` exists and contains a `## Milestones` section (written by `/adev-vision`)
3. At least one feature charter exists under `.context-index/specs/features/`

If `.context-index/` does not exist, tell the user:

> This project has not been initialized with the Agentic Development Framework. Run `/adev-init` first.

If `product.md` is missing or has no `## Milestones` section, tell the user:

> No Milestones section found in product.md. Run `/adev-vision` first to define milestones, then come back to generate the roadmap.

And stop. Do not proceed.

If no feature charters exist, print a warning and create a minimal roadmap with only the milestone structure:

> No feature charters found. Generating a minimal roadmap with milestone structure only. Use `/adev-brainstorm` to create charters for your features, then re-run `/adev-roadmap` for full dependency analysis.

---

## Step 1: Load Context

Read these files using Glob/Grep/Read. Do not ask the user for information that exists in these files.

**Required:**
- `.context-index/constitution.md` — project identity and constraints
- `.context-index/manifest.yaml` — check for `tasks.backend` configuration
- `.context-index/specs/product.md` — parse the `## Milestones` section to extract milestone names, features, statuses, and targets

**Feature charters:**
- `Glob(".context-index/specs/features/*/charter.md")` — read all feature charters. For each, extract:
  - Charter name and scope
  - Dependencies table (other features this depends on)
  - Capability Map (what it provides)
  - Interface Contracts (what it exposes or consumes)

**Specs:**
- `Glob(".context-index/specs/features/**/*.md")` — read all specs (excluding `charter.md`, `*.plan.md`, `*.review.md`). For each, extract:
  - Preconditions (other specs or features required)
  - Behavioral contracts that reference other features
  - Status (draft, review-pending, review-passed, implemented)

**Issue board:**
- `.context-index/tasks/tasks.md` — read existing epics and their milestone assignments

After loading, summarize:
- Number of milestones found
- Number of charters loaded
- Number of specs loaded
- Current epic status on issue board

### Milestone Filtering

If `--milestone <name>` was specified:
- Filter to features belonging to that milestone only
- If the milestone name does not match any milestone in product.md, print the available milestones and ask the user to choose:

> Milestone "<name>" not found. Available milestones:
> 1. <milestone-1>
> 2. <milestone-2>
>
> Which milestone would you like to generate a roadmap for?

Wait for the user to respond before proceeding.

---

## Step 2: Build Dependency Graph

Construct a cross-feature dependency graph from the loaded charters and specs.

### Sources of Dependency Information

1. **Charter Dependencies tables** — Each charter may have a Dependencies section listing other features it depends on. These are direct feature-to-feature dependencies.
2. **Spec Preconditions** — Each spec may list preconditions that reference other features or specs. These imply that the referenced feature must be implemented first.
3. **Interface Contracts** — If a charter consumes an API provided by another charter, that creates an implicit dependency.

### Graph Construction

For each feature in the target milestones:

1. Read the charter's Dependencies table. For each dependency:
   - If the dependency is a feature with a charter, add a directed edge: `dependency -> this feature`
   - If the dependency is external (no charter), note it as an external dependency
2. Read all specs under the charter. For each spec's Preconditions:
   - If a precondition references another feature or spec, add a directed edge from that feature to this one
3. Build the complete directed acyclic graph (DAG)

### Circular Dependency Detection

After building the graph, check for cycles. If a circular dependency is detected:

1. Report the exact cycle path: `feature-a -> feature-b -> feature-c -> feature-a`
2. Print:

> Circular dependency detected: <cycle path>
>
> This must be resolved before a valid implementation order can be determined. Options:
> 1. Break the cycle by removing a dependency in one of the charters
> 2. Merge the dependent features into a single implementation unit
> 3. Introduce an interface abstraction to decouple the cycle
>
> Which approach would you like to take?

Wait for the user to resolve the cycle before proceeding. Do not attempt to produce a roadmap with circular dependencies.

---

## Step 3: Critical Path Analysis

Determine the critical path — the longest chain of dependent features through the dependency graph. This is the sequence of features that constrains the overall timeline.

### Method

1. For each feature with no dependents (leaf nodes), trace backwards through all dependency chains
2. The longest chain (by feature count) is the critical path
3. If multiple chains have the same length, report all of them

### Output

Present the critical path to the user:

```
## Critical Path

The longest dependency chain constraining the timeline:

<feature-a> -> <feature-b> -> <feature-c> -> <feature-d>

Length: 4 features in sequence
Bottleneck: <feature-a> (blocks the most downstream features)
```

If there are no dependencies (all features are independent), note:

> No cross-feature dependencies found. All features can be implemented in parallel.

---

## Step 4: Risk Assessment

Assess risk for each feature using the following factors:

| Factor | High Risk | Medium Risk | Low Risk |
|--------|-----------|-------------|----------|
| **Spec completeness** | No specs exist | Some specs in draft | All specs review-passed |
| **Dependency count** | 3+ dependencies | 1-2 dependencies | No dependencies |
| **Complexity signals** | Charter mentions "complex", large capability map, cross-cutting concerns | Moderate scope, some external interfaces | Small scope, self-contained |
| **On critical path** | Yes, and early in chain | Yes, but late in chain | No |

### Risk Rating

Combine the factors to produce an overall risk rating per feature:
- **High:** 2 or more High factors, or on critical path with no specs
- **Medium:** 1 High factor, or 2+ Medium factors
- **Low:** All Low factors, or at most 1 Medium factor

Present the risk assessment as a table:

```
| Feature | Risk | Spec Status | Dependencies | Factors |
|---------|------|-------------|--------------|---------|
| feature-a | High | No specs | 3 deps | On critical path, no specs, high dep count |
| feature-b | Medium | Draft | 1 dep | Draft specs, on critical path |
| feature-c | Low | Review-passed | 0 deps | Self-contained, specs complete |
```

---

## Step 5: Generate Roadmap Document

Produce the roadmap document combining all analysis results.

### Topological Sort

Sort all features in dependency order (topological sort). Features with no dependencies come first. Features that depend on others come after their dependencies. Break ties alphabetically.

### Parallelization Opportunities

Group features that have no mutual dependencies and can be worked on simultaneously:

```
## Parallelization Groups

### Group 1 (can start immediately)
- feature-a (no dependencies)
- feature-c (no dependencies)

### Group 2 (after Group 1)
- feature-b (depends on: feature-a)
- feature-d (depends on: feature-c)

### Group 3 (after Group 2)
- feature-e (depends on: feature-b, feature-d)
```

### Specs Needed

Flag any charters that have no specs:

```
## Specs Needed

The following features have charters but no specs. Use `/adev-specify` to create specs before implementation:

- <feature-name-1> (charter: .context-index/specs/features/<name>/charter.md)
- <feature-name-2> (charter: .context-index/specs/features/<name>/charter.md)
```

### Document Structure

The complete roadmap document uses this structure:

```markdown
---
milestones:
  - <milestone-1>
  - <milestone-2>
generated: <YYYY-MM-DD>
feature-count: <N>
---

# Implementation Roadmap

> Generated by /adev-roadmap on <date>

## Overview

- **Milestones:** <N>
- **Features:** <N>
- **Critical path length:** <N> features
- **Risk distribution:** <N> high, <N> medium, <N> low

## Milestone: <Name>

### Features
- <feature-1> (charter: <path>)
- <feature-2> (charter: <path>)

### Dependency Graph

<feature-a> -> <feature-b>
<feature-a> -> <feature-c>
<feature-c> -> <feature-d>

### Implementation Order

1. <feature-a> — no dependencies
2. <feature-b> — depends on: feature-a
3. <feature-c> — depends on: feature-a
4. <feature-d> — depends on: feature-c

### Risk Assessment

| Feature | Risk | Spec Status | Dependencies | Factors |
|---------|------|-------------|--------------|---------|
| feature-a | Low | Review-passed | 0 | Self-contained |
| feature-b | Medium | Draft | 1 | Draft specs |

### Parallelization Groups

#### Group 1 (can start immediately)
- feature-a

#### Group 2 (after feature-a)
- feature-b
- feature-c

#### Group 3 (after feature-c)
- feature-d

## Specs Needed

- <feature> (charter: <path>) — Use `/adev-specify`

## Critical Path

<feature-a> -> <feature-c> -> <feature-d>

Length: 3 features | Bottleneck: feature-a
```

---

## Step 6: Save Roadmap

Save the generated roadmap document to `.context-index/specs/roadmap/`.

### Naming Convention

- **Single milestone:** `.context-index/specs/roadmap/<milestone-slug>.md` where `<milestone-slug>` is the milestone name lowercased with spaces replaced by hyphens (e.g., "MVP Launch" becomes `mvp-launch.md`)
- **All milestones:** `.context-index/specs/roadmap/full-roadmap.md`

### Directory Creation

If `.context-index/specs/roadmap/` does not exist, create it before writing.

### Overwrite Behavior

If a roadmap file already exists at the target path, overwrite it. The roadmap is regenerated from current data each time — it is not manually edited.

After saving, confirm: "Saved roadmap to <path>."

---

## Step 7: Update Issue Board

Update epics on the issue board with milestone assignments.

### Guard: Check tasks.backend

Before updating epics, read `manifest.yaml` and check for `tasks.backend` configuration. If unconfigured, print:

> Issue board not configured (no `tasks.backend` in manifest). Skipping epic updates. Run `/adev-init` with task tracking to enable this.

And skip this step.

### Epic Update Rules

1. Read existing epics from the issue board
2. For each milestone, check if an epic exists with a matching `milestone` field
3. If an epic exists but is missing milestone assignment, update it with `updateEpic()` to set the milestone field
4. **Cross-feature dependencies are stored in the roadmap document, not on the issue board.** The `addDependency()` function operates on issues, not epics, so dependency tracking lives in the roadmap's Dependency Graph section as the source of truth.
5. Do not create new epics — that is the responsibility of `/adev-vision`. Only update existing epics with milestone assignments if they are missing.

After updating, report: "Updated N epics with milestone assignments."

---

## Step 8: Summary Report

Present a final summary to the user:

```
## Roadmap Summary

- **Milestones analyzed:** N
- **Features included:** N
- **Critical path length:** N features
- **Risk distribution:** N high, N medium, N low
- **Parallelization groups:** N groups
- **Specs needed:** N features
- **Roadmap saved to:** <path>

### Recommended Next Steps
- [if high-risk features] Address high-risk features first: <list>
- [if specs needed] Create specs for: <list> (use `/adev-specify`)
- [if charters needed] Create charters for: <list> (use `/adev-brainstorm`)
- [if roadmap complete] Begin implementation with `/adev-plan --phase <milestone>`
```

---

## Key Principles

1. **Read-only analysis** — This skill reads charters, specs, and the issue board but does not modify them (except the roadmap output file and epic milestone assignments). It never edits charters, specs, or the constitution.
2. **Roadmap is the dependency source of truth** — Cross-feature dependencies are recorded in the roadmap document's Dependency Graph section, not via `addDependency()` on the issue board. The issue model's dependency system operates on issues, not epics.
3. **Graceful degradation** — If no charters exist, produce a minimal roadmap with milestone structure only. If some charters lack specs, include them but flag as "specs needed". Always produce the most useful output possible.
4. **Circular dependencies are blocking** — Do not produce a roadmap with circular dependencies. Report the cycle and require user resolution before proceeding.
5. **Deterministic ordering** — Topological sort is the primary ordering. Ties are broken alphabetically to ensure consistent output across runs.
6. **Milestone slugs are stable** — The slug is derived from the milestone name by lowercasing and replacing spaces with hyphens. This ensures consistent file naming across regenerations.
7. **Overwrite, don't accumulate** — The roadmap file is regenerated from current data each time. Previous versions are overwritten. Use version control to track roadmap history.
