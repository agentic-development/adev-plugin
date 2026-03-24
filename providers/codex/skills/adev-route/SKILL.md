---
name: adev-route
description: "Score tasks on a four-dimensional routing matrix (spec completeness, pattern coverage, blast radius, novelty) and recommend auto-agent, assisted-agent, or human-only execution. In Codex, invoke with $adev-route"
---

# Task Routing Advisor

Score each task in an implementation plan and recommend routing mode.

**Announce:** "I'm using the adev-route skill to score tasks and recommend routing."

## Arguments

- `--plan <path>`: route all tasks in a plan
- `--task <N>`: route a specific task
- `--dry-run`: show scores without writing annotations

## Step 1: Load Context

Read:
1. The plan file
2. The spec
3. Constitution
4. Manifest (specialists registry)
5. Golden samples
6. Boundary rules
7. Risk policies

## Step 2: Score Each Task

Four dimensions (1-5 each):

### Dimension 1: Spec Completeness

- 5: Explicit acceptance criteria, behavioral contract, error cases
- 4: Acceptance criteria + behavioral contract
- 3: Acceptance criteria only
- 2: Task description only
- 1: Minimal title

### Dimension 2: Pattern Coverage

- 5: Golden sample exists
- 4: Similar golden sample
- 3: Similar code in codebase
- 2: Related patterns exist
- 1: No precedent

### Dimension 3: Blast Radius (inverted)

- 5: 1-2 files, single module
- 4: 3-5 files, single module
- 3: 2 modules or 1 boundary
- 2: 3+ modules or multiple boundaries
- 1: Shared infrastructure, auth, schema

### Dimension 4: Novelty (inverted)

- 5: Pure pattern application
- 4: Minor variation
- 3: Combines 2-3 patterns
- 2: Design decisions needed
- 1: Research-grade problem

## Step 3: Compute Routing

Sum scores (4-20):

| Score | Route |
|-------|-------|
| 16-20 | `auto-agent` |
| 10-15 | `assisted-agent` |
| 4-9 | `human-only` |

Override: If any dimension = 1, minimum `assisted-agent`.

## Step 4: Write Annotations

```markdown
**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=5 blast=5 novelty=4
**Rationale:** Well-specified, golden sample exists, minimal blast radius
```

## Step 5: Report

```
| # | Task | Route | Score |
|---|------|-------|-------|
| 1 | Create User model | auto-agent | 19/20 |
| 2 | Auth middleware | assisted-agent | 12/20 |
| 3 | Payment flow | human-only | 7/20 |

Annotations written to <plan file>.
```

## Integration

When `$adev-implement` reads routed tasks:
- `auto-agent`: Standard dispatch
- `assisted-agent`: Pause after RED for review
- `human-only`: Scaffold only, present as checklist
